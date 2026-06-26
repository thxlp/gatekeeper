const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { authenticate } = require('./middleware/auth');
const { checkEntitlement } = require('./entitlement/policyEngine');
const { recordUsage } = require('./entitlement/usageCollector');
const secretScan = require('./scanner/secretScan');
const patternMatch = require('./scanner/patternMatch');
const dependencyAudit = require('./scanner/dependencyAudit');
const riskEngine = require('./decision/riskEngine');
const ticket = require('./ticket/ticket');
const deployTrigger = require('./orchestrator/deployTrigger');
const auditLog = require('./audit/auditLog');

const PORT = process.env.PORT || 8088;
const stagingRoot = path.join(__dirname, '..', 'data', 'staging');
const quarantineRoot = path.join(__dirname, '..', 'data', 'quarantine');

const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50MB guard กัน request-body bomb

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        tooLarge = true;
        req.destroy();
        reject(new Error('payload_too_large'));
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(body);
}

/**
 * payload ที่คาดหวังจาก client (dashboard "Deploy" button / CI webhook):
 * {
 *   "runtime": "node",
 *   "feature": "basic-deploy",
 *   "files": [ { "path": "index.js", "content_base64": "..." } ]
 * }
 */
async function handleDeploy(req, res) {
  const requestId = crypto.randomUUID();
  let stagingDir = null;

  try {
    // ---- Stage 1: AuthN/AuthZ ----
    const auth = authenticate(req);
    if (!auth.ok) {
      auditLog.append({ requestId, stage: 'auth', decision: 'BLOCK', reason: auth.reason });
      return sendJson(res, 401, { decision: 'BLOCK', requestId, reason: 'unauthorized' });
    }
    const account = auth.account;

    const body = await readJsonBody(req);
    const { runtime, feature, files } = body;

    if (!Array.isArray(files) || files.length === 0) {
      auditLog.append({ requestId, accountId: account.id, stage: 'validate', decision: 'BLOCK', reason: 'no_files' });
      return sendJson(res, 400, { decision: 'BLOCK', requestId, reason: 'no_files_in_payload' });
    }

    const totalBytes = files.reduce(
      (sum, f) => sum + Buffer.byteLength(f.content_base64 || '', 'base64'),
      0
    );
    const artifactSizeMb = totalBytes / (1024 * 1024);

    // ---- Stage 2: Entitlement Engine ----
    const entitlement = checkEntitlement(account, { runtime, feature, artifactSizeMb });
    recordUsage({
      requestId,
      accountId: account.id,
      plan: account.plan,
      feature,
      runtime,
      allowed: entitlement.allowed,
    });

    if (!entitlement.allowed) {
      auditLog.append({
        requestId,
        accountId: account.id,
        stage: 'entitlement',
        decision: 'BLOCK',
        reason: entitlement.reason,
      });
      return sendJson(res, 403, { decision: 'BLOCK', requestId, reason: entitlement.reason });
    }

    // เขียนไฟล์ลง staging directory แยกต่อ request (isolation ระดับ filesystem)
    stagingDir = path.join(stagingRoot, requestId);
    fs.mkdirSync(stagingDir, { recursive: true });

    const writtenFiles = [];
    for (const f of files) {
      // กัน path traversal เบื้องต้น (../../etc/passwd)
      const safeRelPath = path
        .normalize(f.path || '')
        .replace(/^(\.\.(\/|\\|$))+/, '')
        .replace(/^[/\\]+/, '');
      if (!safeRelPath) continue;

      const fullPath = path.join(stagingDir, safeRelPath);
      if (!fullPath.startsWith(stagingDir)) continue; // กันหลุด staging dir อีกชั้น

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      const content = Buffer.from(f.content_base64 || '', 'base64');
      fs.writeFileSync(fullPath, content);
      writtenFiles.push({ path: safeRelPath, textContent: content.toString('utf8') });
    }

    // ---- Stage 3: Pre-runtime Security Scanner ----
    let findings = [];
    for (const wf of writtenFiles) {
      findings = findings.concat(secretScan.scanContent(wf.path, wf.textContent));
      findings = findings.concat(patternMatch.scanContent(wf.path, wf.textContent));
    }
    findings = findings.concat(dependencyAudit.scanDependencies(writtenFiles));

    // ---- Stage 4: Risk & Decision Engine ----
    const result = riskEngine.evaluate(findings);

    if (result.decision === 'ALLOW') {
      const signedTicket = ticket.sign({ request_id: requestId, account_id: account.id }, 60);
      const deployResult = deployTrigger.deploy({ stagingDir, signedTicket });

      auditLog.append({
        requestId,
        accountId: account.id,
        stage: 'decision',
        decision: 'ALLOW',
        score: result.score,
        findings: result.findings,
        deployResult,
      });

      fs.rmSync(stagingDir, { recursive: true, force: true });
      return sendJson(res, 200, {
        decision: 'ALLOW',
        requestId,
        score: result.score,
        deployedPath: deployResult.deployedPath,
      });
    }

    if (result.decision === 'QUARANTINE') {
      fs.mkdirSync(quarantineRoot, { recursive: true });
      const quarantineDir = path.join(quarantineRoot, requestId);
      fs.renameSync(stagingDir, quarantineDir);
      stagingDir = null; // ย้ายไปแล้ว ไม่ต้อง cleanup ซ้ำใน finally

      auditLog.append({
        requestId,
        accountId: account.id,
        stage: 'decision',
        decision: 'QUARANTINE',
        score: result.score,
        findings: result.findings,
      });

      return sendJson(res, 202, {
        decision: 'QUARANTINE',
        requestId,
        message: 'รอตรวจสอบจากทีม SecOps',
        score: result.score,
        findings: result.findings,
      });
    }

    // BLOCK
    auditLog.append({
      requestId,
      accountId: account.id,
      stage: 'decision',
      decision: 'BLOCK',
      score: result.score,
      findings: result.findings,
    });
    return sendJson(res, 403, {
      decision: 'BLOCK',
      requestId,
      reason: 'deploy_blocked_by_security_policy',
      score: result.score,
      findings: result.findings,
    });
  } catch (err) {
    // ---- Fail-Closed ----
    // ถ้า stage ไหนก็ตามพังโดยไม่คาดคิด ต้องตอบ BLOCK ไม่ใช่ปล่อยผ่าน
    auditLog.append({ requestId, stage: 'fatal', decision: 'BLOCK', reason: err.message });
    return sendJson(res, 500, { decision: 'BLOCK', requestId, reason: 'internal_error_fail_closed' });
  } finally {
    if (stagingDir && fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/deploy') {
    return handleDeploy(req, res);
  }
  if (req.method === 'GET' && req.url === '/healthz') {
    return sendJson(res, 200, { status: 'ok' });
  }
  sendJson(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`[gatekeeper] listening on http://localhost:${PORT}`);
});

module.exports = { server };

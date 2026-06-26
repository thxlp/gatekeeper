const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8088;

function post(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/deploy',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch (e) {
            parsed = { raw: body };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function fileFromFixture(relPath) {
  const fullPath = path.join(__dirname, '..', 'test', 'fixtures', relPath);
  const content = fs.readFileSync(fullPath);
  return { path: relPath, content_base64: content.toString('base64') };
}

async function run(title, apiKey, payload, expect) {
  console.log(`\n--- ${title} (คาดว่า: ${expect}) ---`);
  const r = await post(apiKey, payload);
  console.log('HTTP', r.status, '| decision =', r.body.decision, '| reason/score =', r.body.reason ?? r.body.score);
}

async function main() {
  await run(
    'Case 1: ไฟล์ปกติ + plan free + feature ที่อนุญาต',
    'demo-free-key',
    { runtime: 'node', feature: 'basic-deploy', files: [fileFromFixture('benign-app.js')] },
    'ALLOW'
  );

  await run(
    'Case 2: ไฟล์มี marker ตรงกับ heuristic/secret rule',
    'demo-free-key',
    { runtime: 'node', feature: 'basic-deploy', files: [fileFromFixture('suspicious-marker.js')] },
    'BLOCK (จาก scanner)'
  );

  await run(
    'Case 3: ขอ feature/runtime ที่ plan free ไม่มีสิทธิ์',
    'demo-free-key',
    { runtime: 'docker', feature: 'cron-jobs', files: [fileFromFixture('benign-app.js')] },
    'BLOCK (จาก entitlement)'
  );

  await run(
    'Case 4: API key ผิด',
    'not-a-real-key',
    { runtime: 'node', feature: 'basic-deploy', files: [fileFromFixture('benign-app.js')] },
    'BLOCK (จาก auth)'
  );

  console.log('\nดู audit trail แบบเต็มได้ที่ data/audit.log');
}

main().catch((e) => {
  console.error('test-client error:', e.message);
  process.exit(1);
});

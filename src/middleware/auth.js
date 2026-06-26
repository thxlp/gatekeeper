const fs = require('fs');
const path = require('path');

const accountsPath = path.join(__dirname, '..', '..', 'configs', 'accounts.json');

function loadAccounts() {
  return JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
}

/**
 * Stage 1: AuthN/AuthZ
 * ตรวจ Authorization: Bearer <api_key> เทียบกับ account DB
 * ของจริงควรเป็น JWT/OIDC + RBAC ตาม resource แต่ที่นี่ทำ API key เพื่อให้รันได้จริงแบบไม่มี dependency
 */
function authenticate(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, reason: 'missing_api_key' };
  }
  const apiKey = match[1].trim();

  const accounts = loadAccounts();
  const account = accounts.find((a) => a.api_key === apiKey);
  if (!account) {
    return { ok: false, reason: 'invalid_api_key' };
  }
  if (account.status !== 'active') {
    return { ok: false, reason: 'account_suspended' };
  }
  return { ok: true, account };
}

module.exports = { authenticate };

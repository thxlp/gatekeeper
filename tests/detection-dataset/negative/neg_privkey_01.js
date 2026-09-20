// The key never lives in the repo: it is mounted read-only by systemd
// and read from disk at boot.
const fs = require('fs');
const jwt = require('jsonwebtoken');

const KEY_PATH = process.env.SIGNING_KEY_PATH || '/run/secrets/signing.key';
const SIGNING_KEY = fs.readFileSync(KEY_PATH, 'utf8');

function sign(payload) {
  return jwt.sign(payload, SIGNING_KEY, { algorithm: 'RS256' });
}

module.exports = { sign };

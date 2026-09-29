// signing helper -- key was pasted inline during a hotfix
const jwt = require('jsonwebtoken');

const SIGNING_KEY = `-----BEGIN PRIVATE KEY-----
RVhBTVBMRUtFWU1BVEVSSUFMRVhBTVBMRUtFWU1BVEVSSUFMRVhBTVBMRUtFWU1B
VEVSSUFMTk9UUkVBTE5PVFJFQUxOT1RSRUFMTk9UUkVBTEVYQU1QTEVPTkxZCg==
-----END PRIVATE KEY-----`;

function sign(payload) {
  return jwt.sign(payload, SIGNING_KEY, { algorithm: 'RS256' });
}

module.exports = { sign };

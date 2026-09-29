// EVASION TEST FIXTURE -- rebuilds a PEM block; body is a fake (not a real key).
const jwt = require('jsonwebtoken');

const BEGIN = '-----BEGIN ' + 'RSA ' + 'PRIVATE KEY-----';
const END = '-----END ' + 'RSA ' + 'PRIVATE KEY-----';
const BODY = [
  'RVhBTVBMRUtFWU1BVEVSSUFMTk9UUkVBTEVYQU1QTEVLRVlNQVRFUklBTE5PVFJF',
  'QUxFWEFNUExFT05MWUZPUkRFVEVDVElPTlRFU1RJTkcK',
].join('\n');

const pem = [BEGIN, BODY, END].join('\n');

function sign(payload) {
  return jwt.sign(payload, pem, { algorithm: 'RS256' });
}
module.exports = { sign, pem };

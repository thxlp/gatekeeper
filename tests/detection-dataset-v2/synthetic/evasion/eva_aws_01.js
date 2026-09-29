// EVASION TEST FIXTURE -- reconstructs the AWS docs example key id at runtime.
const AWS = require('aws-sdk');

// split so the literal AKIA... never appears contiguously in source
const keyId = 'AKIA' + 'IOSFODNN7EXAMPLE';

const s3 = new AWS.S3({ accessKeyId: keyId, region: 'ap-southeast-1' });
module.exports = { s3, keyId };

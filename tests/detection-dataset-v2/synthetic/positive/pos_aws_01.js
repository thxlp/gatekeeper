// deploy helper for the reporting bucket
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  region: 'ap-southeast-1',
});

module.exports = { s3 };

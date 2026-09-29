# Setting up S3 uploads

Create an IAM user and copy its access key id into your `.env`.
AWS documents the shape of the value with the published sample id
`AKIAIOSFODNN7EXAMPLE` -- that string is a placeholder from the AWS
docs, not a working credential, so never paste it into production.

```
AWS_ACCESS_KEY_ID=<your key id here>
```

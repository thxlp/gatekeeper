# Rotating the signing key

Generate a fresh key pair on the host, never in the repository:

```
openssl genrsa -out signing.key 4096
```

The output file starts with a `BEGIN RSA PRIVATE KEY` header line.
Keep it under /run/secrets and mount it read-only; only the public
half (`signing.pub`) is safe to commit.

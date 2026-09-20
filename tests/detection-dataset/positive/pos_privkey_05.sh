#!/usr/bin/env bash
set -euo pipefail

mkdir -p ~/.ssh
cat > ~/.ssh/id_rsa <<'KEY'
-----BEGIN RSA PRIVATE KEY-----
RVhBTVBMRVJTQUtFWU5PVFJFQUxFWEFNUExFUlNBS0VZTk9UUkVBTEVYQU1QTEVS
U0FLRVlOT1RSRUFMRVhBTVBMRU9OTFlGT1JURVNUSU5HCg==
-----END RSA PRIVATE KEY-----
KEY
chmod 600 ~/.ssh/id_rsa

git clone git@github.com:example/app.git

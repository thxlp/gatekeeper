#!/usr/bin/env bash
# Health probe: fetch JSON and hand it to jq. No shell interpretation.
set -euo pipefail

curl -fsS https://gatekeeper.example.com/api/healthz | jq -r '.status'

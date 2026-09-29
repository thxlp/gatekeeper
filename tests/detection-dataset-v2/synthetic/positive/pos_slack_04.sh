#!/usr/bin/env bash
set -euo pipefail

TOKEN=xoxa-EXAMPLE-NOT-REAL-WORKSPACE-TOKEN-FOR-DETECTION-TEST

curl -sS -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer ${TOKEN}" \
  -d channel=#alerts -d text="deploy finished"

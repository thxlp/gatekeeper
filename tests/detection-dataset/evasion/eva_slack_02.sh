#!/usr/bin/env bash
# EVASION TEST FIXTURE -- builds a Slack-shaped example token from parts.
set -euo pipefail

P=xoxp
A=000000000000
B=EXAMPLEONLYNOTREAL
TOKEN="${P}-${A}-${A}-${A}-${B}"

curl -sS -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer ${TOKEN}" \
  -d channel=#alerts -d text="hi"

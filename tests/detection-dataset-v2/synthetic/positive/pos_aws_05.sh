#!/usr/bin/env bash
set -euo pipefail

export AWS_REGION=ap-southeast-1
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE

aws s3 sync ./dist s3://reports-bucket/dist

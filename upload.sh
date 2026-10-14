#!/bin/bash
set -euo pipefail

STAGE_DIR="target/public"

# Prepare staging directory with deployable assets
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
cp -p index.html game.js *.mp3 "$STAGE_DIR/"
cp -rp dist "$STAGE_DIR/"

# Sync to S3, pruning obsolete files while preserving trailer/
aws --profile tiuhti s3 sync "$STAGE_DIR/" s3://tiuhti-web/tsirppu-dash/ \
  --exclude "trailer/*" \
  --delete \
  "$@"


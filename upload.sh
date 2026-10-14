#!/bin/bash
set -euo pipefail

# Determine branch name and target paths
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
TARGET_BRANCH="${BRANCH:-$CURRENT_BRANCH}"

SYNC_ARGS=()
FORCE_PROD=false

for arg in "$@"; do
  case "$arg" in
    --prod)
      FORCE_PROD=true
      ;;
    *)
      SYNC_ARGS+=("$arg")
      ;;
  esac
done

if [ "$FORCE_PROD" = true ] || [ "$TARGET_BRANCH" = "main" ] || [ "$TARGET_BRANCH" = "master" ] || [ -z "$TARGET_BRANCH" ]; then
  DEST_URI="s3://tiuhti-web/tsirppu-dash/"
  PUBLIC_URL="https://tiuhti.net/tsirppu-dash/"
  EXCLUDE_FLAGS=(--exclude "trailer/*" --exclude "branch/*")
else
  SAFE_BRANCH=$(echo "$TARGET_BRANCH" | tr '/' '-')
  DEST_URI="s3://tiuhti-web/tsirppu-dash/branch/${SAFE_BRANCH}/"
  PUBLIC_URL="https://tiuhti.net/tsirppu-dash/branch/${SAFE_BRANCH}/"
  EXCLUDE_FLAGS=()
fi

echo "==> Deploying branch '${TARGET_BRANCH:-main}'"
echo "    Destination: ${DEST_URI}"
echo "    Public URL:  ${PUBLIC_URL}"

STAGE_DIR="target/public"

# Prepare staging directory with deployable assets
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
cp -p index.html game.js *.mp3 "$STAGE_DIR/"
cp -rp dist "$STAGE_DIR/"

# Sync to S3, pruning obsolete files while protecting excluded paths
aws --profile tiuhti s3 sync "$STAGE_DIR/" "$DEST_URI" \
  ${EXCLUDE_FLAGS[@]+"${EXCLUDE_FLAGS[@]}"} \
  --delete \
  ${SYNC_ARGS[@]+"${SYNC_ARGS[@]}"}

echo "==> Release complete!"
echo "    Live at: ${PUBLIC_URL}"


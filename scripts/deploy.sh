#!/usr/bin/env bash
# Deploy phonebook to server via rsync and SSH.
# Default: mark:/home/markdebian/phonebook. Override with first argument or PHONEBOOK_DEPLOY_DEST.
# Options: --no-build (skip frontend build), --sync (run LDAP sync on server before pm2 restart).

set -e

DEST="${PHONEBOOK_DEPLOY_DEST:-mark:/home/markdebian/phonebook}"
NO_BUILD=
DO_SYNC=

for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    --sync)     DO_SYNC=1 ;;
    *)
      if [[ "$arg" != --* ]] && [[ -z "${DEST_SET:-}" ]]; then
        DEST="$arg"
        DEST_SET=1
      fi
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# 1. Build frontend unless --no-build
if [[ -z "$NO_BUILD" ]]; then
  echo "Building frontend..."
  (cd frontend && npm run build)
fi

# 2. Rsync with minimal payload
echo "Syncing to $DEST..."
rsync -avz --delete \
  --exclude='data/' \
  --exclude='node_modules/' \
  --exclude='frontend/node_modules/' \
  --exclude='frontend/src/' \
  --exclude='frontend/img/' \
  --exclude='frontend/.parcelrc' \
  --exclude='frontend/README.md' \
  --exclude='frontend/.parcel-cache/' \
  --exclude='frontend/.dev/' \
  --exclude='frontend/docs/' \
  --exclude='.git/' \
  --exclude='.cursor/' \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  --exclude='.env.local' \
  --exclude='.env.*.local' \
  ./ "$DEST/"

# 3. SSH: optional sync, pm2 restart
REMOTE_HOST="${DEST%%:*}"
REMOTE_PATH="${DEST#*:}"
REMOTE_CMD="cd $REMOTE_PATH"
[[ -n "$DO_SYNC" ]] && REMOTE_CMD="$REMOTE_CMD && npm run start:sync"
REMOTE_CMD="$REMOTE_CMD && pm2 restart phonebook"

echo "Running on $REMOTE_HOST: $REMOTE_CMD"
ssh "$REMOTE_HOST" "$REMOTE_CMD"

echo "Deploy done."

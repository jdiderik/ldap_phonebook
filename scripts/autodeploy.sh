#!/usr/bin/env bash
# Autodeploy: same as deploy but only restarts pm2 when server-relevant files changed.
# Server-relevant = server/, .env, package.json, package-lock.json.
# When package.json or package-lock.json changed, runs npm ci --omit=dev on the server before restart.
# Use: npm run autodeploy  or  ./scripts/autodeploy.sh [--no-build] [--sync]
# Options: --no-build (skip frontend build), --sync (run LDAP sync on server when we restart).

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

RSYNC_EXCLUDES=(
  --exclude='data/'
  --exclude='node_modules/'
  --exclude='frontend/node_modules/'
  --exclude='frontend/src/'
  --exclude='frontend/img/'
  --exclude='frontend/.parcelrc'
  --exclude='frontend/README.md'
  --exclude='frontend/.parcel-cache/'
  --exclude='frontend/.dev/'
  --exclude='frontend/docs/'
  --exclude='.git/'
  --exclude='.cursor/'
  --exclude='scripts/'
  --exclude='.DS_Store'
  --exclude='*.log'
  --exclude='.env.local'
  --exclude='.env.*.local'
)

# 1. Build frontend unless --no-build
if [[ -z "$NO_BUILD" ]]; then
  echo "Building frontend..."
  (cd frontend && npm run build)
fi

# 2. Dry-run rsync to see what would change; detect if any server-relevant file changes
echo "Checking for server file changes..."
DRY_RUN_OUT=$(mktemp)
trap 'rm -f "$DRY_RUN_OUT"' EXIT
/usr/bin/rsync -ani --delete --rsync-path=/usr/bin/rsync "${RSYNC_EXCLUDES[@]}" ./ "$DEST/" 2>/dev/null > "$DRY_RUN_OUT" || true

NEED_RESTART=
NEED_NPM_CI=
while IFS= read -r line; do
  path="${line#???????????}"  # strip first 11 chars (itemize change type)
  while [[ "$path" == " "* ]]; do path="${path# }"; done  # trim leading spaces
  case "$path" in
    server/*|.env)           NEED_RESTART=1 ;;
    package.json|package-lock.json) NEED_RESTART=1; NEED_NPM_CI=1 ;;
  esac
done < "$DRY_RUN_OUT"

# 3. Real rsync
echo "Syncing to $DEST..."
/usr/bin/rsync -avz --delete --rsync-path=/usr/bin/rsync "${RSYNC_EXCLUDES[@]}" ./ "$DEST/"

# 4. Restart only when server-relevant files changed; run npm ci when package*.json changed
if [[ -n "$NEED_RESTART" ]]; then
  REMOTE_HOST="${DEST%%:*}"
  REMOTE_PATH="${DEST#*:}"
  REMOTE_CMD="cd $REMOTE_PATH"
  [[ -n "$NEED_NPM_CI" ]] && REMOTE_CMD="$REMOTE_CMD && npm ci --omit=dev"
  [[ -n "$DO_SYNC" ]] && REMOTE_CMD="$REMOTE_CMD && npm run start:sync"
  REMOTE_CMD="$REMOTE_CMD && pm2 restart phonebook"
  [[ -n "$NEED_NPM_CI" ]] && echo "package.json or package-lock.json changed; will run npm ci on server."
  echo "Server files changed; running on $REMOTE_HOST: pm2 restart phonebook"
  ssh "$REMOTE_HOST" "bash -lc '$REMOTE_CMD'"
else
  echo "No server files changed; skipping pm2 restart."
fi

echo "Autodeploy done."

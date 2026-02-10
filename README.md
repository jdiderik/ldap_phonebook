# Phonebook

LDAP-backed phonebook with a Fastify API and Mithril.js frontend.

## Deployment

Deploy via rsync and SSH using the script in `scripts/deploy.sh`. Default target: **`mark:/home/markdebian/phonebook`** (SSH host `mark`, app path `/home/markdebian/phonebook`). PM2 app name: **`phonebook`**.

### One-time server setup

- **`.env`**: Deployed by rsync from your local repo; ensure it contains production values.
- **`data/`**: On the server run `mkdir -p /home/markdebian/phonebook/data` once; the app and sync create `data/lmdb` and `data/sync-logs`.
- **First run**: After the first deploy, if the PM2 app does not exist yet, on the server run:  
  `cd /home/markdebian/phonebook && pm2 start server/api.js --name phonebook`
- **LDAP sync**: Run `npm run start:sync` once (and optionally after each deploy with `--sync` or via cron).

### Deploy script usage

**Deploy (always syncs; restart is explicit or skipped with `--no-restart`):**

```bash
./scripts/deploy.sh                    # build frontend, rsync code, then pm2 restart on server
./scripts/deploy.sh --no-build         # skip frontend build
./scripts/deploy.sh --no-restart       # only sync; skip SSH and pm2 restart (e.g. code-only deploy)
./scripts/deploy.sh --sync             # run LDAP sync on server before pm2 restart
PHONEBOOK_DEPLOY_DEST=other:/path ./scripts/deploy.sh   # override destination
```

**Autodeploy (restart only when server files changed):**

```bash
npm run autodeploy                     # sync; restart pm2 only if server/, .env, or package*.json changed
./scripts/autodeploy.sh --no-build     # skip frontend build
./scripts/autodeploy.sh --sync         # when restarting, run LDAP sync before pm2 restart
```

The script builds the frontend (unless `--no-build`), rsyncs a minimal payload (server, frontend/www, package files, .env; excludes data/, node_modules, frontend source), then SSHs to the host and runs `pm2 restart phonebook` (and optionally `npm run start:sync` if you pass `--sync`). Use `--no-restart` to only sync files and skip the restart. The remote command runs in a login shell so `pm2` is on PATH. It does not run `npm ci` on the server. When you change dependencies (e.g. after pulling or editing `package.json` / `package-lock.json`), run `npm ci --omit=dev` on the server yourself, e.g. `ssh mark "cd /home/markdebian/phonebook && npm ci --omit=dev"`, then restart if needed.

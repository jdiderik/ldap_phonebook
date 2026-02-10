# Phonebook

LDAP-backed phonebook with a Fastify API and Mithril.js frontend.

## Deployment

Deploy via rsync and SSH. Default target: **`mark:/home/markdebian/phonebook`** (SSH host `mark`, app path `/home/markdebian/phonebook`). PM2 app name: **`phonebook`**.

The default **`npm run deploy`** runs autodeploy: it syncs code and only restarts pm2 when server-relevant files changed (`server/`, `.env`, `package.json`, `package-lock.json`). When `package.json` or `package-lock.json` changed, it runs `npm ci --omit=dev` on the server before restart. Frontend-only changes sync without a restart.

### One-time server setup

- **`.env`**: Deployed by rsync from your local repo; ensure it contains production values.
- **`data/`**: On the server run `mkdir -p /home/markdebian/phonebook/data` once; the app and sync create `data/lmdb` and `data/sync-logs`.
- **First run**: After the first deploy, if the PM2 app does not exist yet, on the server run:  
  `cd /home/markdebian/phonebook && pm2 start server/api.js --name phonebook`
- **LDAP sync**: Run `npm run start:sync` once (and optionally after each deploy with `--sync` or via cron).

### Deploy usage (default: autodeploy)

```bash
npm run deploy                          # build, rsync; restart pm2 only if server files changed
npm run deploy:no-build                 # skip frontend build
npm run deploy:sync                     # when restarting, run LDAP sync before pm2 restart
npm run deploy:restart                  # always sync and restart pm2 (runs scripts/deploy.sh)
PHONEBOOK_DEPLOY_DEST=other:/path npm run deploy   # override destination
```

Or run the script directly: `./scripts/autodeploy.sh` (same as `npm run deploy`), `./scripts/autodeploy.sh --no-build`, `./scripts/autodeploy.sh --sync`.

The deploy scripts build the frontend (unless `--no-build`), rsync a minimal payload (server, frontend/www, package files, .env; excludes data/, node_modules, frontend source, scripts/). When a restart runs, it uses a login shell on the server so `pm2` is on PATH. Autodeploy runs `npm ci --omit=dev` on the server when `package.json` or `package-lock.json` changed; the explicit `deploy.sh` (npm run deploy:restart) does not run `npm ci`.

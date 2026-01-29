# Server

API and sync entry points. Shared logic lives in `lib/`.

## Structure

- **api.js** – HTTP server entry: CORS, routes, static frontend, listen.
- **sync.js** – LDAP sync script: delta sync into LMDB, writes to `data/sync-logs/`.
- **testLdap.js** – LDAP diagnostics script.
- **lib/** – Shared code:
  - **config.js** – LDAP env, `HAS_LDAP_CONFIG`, `TEST_MODE`, paths (`PROJECT_ROOT`, `DATA_LMDB`, `SYNC_LOGS_DIR`, `ENV_PATH`), `validateLdapConfig()`.
  - **db.js** – LMDB open and stores: `usersByDN`, `userFavorites`, `usersByGUID`, `indexDB`, `userTokensByDN`, `allDNs`.
  - **auth.js** – LDAP auth, sessions (access/refresh), `requireAuth`, `requireAdminFlag`, `requireAdmin`.
  - **cors.js** – `registerCors(fastify)` for dev CORS.
  - **static.js** – `registerStatic(fastify)` for frontend/www and SPA fallback.
- **routes/** – Fastify route modules: auth, users, favorites, admin.

## Extending

- **New API route**: Add a file in `routes/` (e.g. `routes/things.js`), export an async `function thingsRoutes(fastify) { ... }`, then in `api.js`: `await fastify.register(thingsRoutes, { prefix: "/api" });`
- **New config**: Add to `lib/config.js` or a new `lib/…` module.
- **New store**: Add in `lib/db.js` with `db.openDB({ name: "…" })`.

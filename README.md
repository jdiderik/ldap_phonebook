# Phonebook

LDAP-backed phonebook with a Fastify API and Mithril.js frontend.

## Deployment / Configuration

Before production deploy, set your public origin and update the frontend:

- **PUBLIC_ORIGIN** (or production URL): Replace the placeholder `your-domain.example.com` in:
  - `frontend/src/index.html` (Content-Security-Policy meta tag)
  - `frontend/.pwamanifestrc` (`scope` and `start_url`)
  with your actual public origin. You can set `PUBLIC_ORIGIN` in `.env` and use a pre-build script to substitute it, or do a one-time find-and-replace before deploy.

See root `.env.example` and `frontend/.env.example` for a commented `PUBLIC_ORIGIN` line.

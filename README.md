# Phonebook

LDAP-backed phonebook with a Fastify API and Mithril.js frontend.

## Deployment / Configuration

**PUBLIC_ORIGIN** is injected at build time from environment (e.g. `frontend/.env`) into the CSP meta tag and PWA manifest. No manual find-and-replace is needed.

- Set `PUBLIC_ORIGIN` in `frontend/.env`: e.g. `http://127.0.0.1:8188` for local dev (or the port your API runs on), and `https://your-domain.example.com` for production builds.
- See `frontend/.env.example` for the dev default and production example.
- The PWA manifest config is generated from `frontend/.pwamanifestrc.template` by `frontend/scripts/inject-public-origin.js` before each build/dev run; output is `frontend/.pwamanifestrc` (gitignored). No source files are modified.

/**
 * @fileoverview Server configuration: LDAP env, feature flags, and path constants.
 */
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** LDAP connection settings from env. */
export const LDAP = {
  url: process.env.LDAP_URL,
  bindDN: process.env.LDAP_BIND_DN,
  bindPW: process.env.LDAP_BIND_PW,
  baseDN: process.env.LDAP_BASE_DN,
};

export const HAS_LDAP_CONFIG = Boolean(
  LDAP.url && LDAP.bindDN && LDAP.bindPW && LDAP.baseDN
);
export const TEST_MODE = process.env.PHONEBOOK_TEST_MODE === "1";

/** Comma-separated list of admin logins (details, admin page, manual users). e.g. ADMIN_USERS=admin.user,other.admin */
const ADMIN_USERS_RAW = process.env.ADMIN_USERS || "";
export const ADMIN_USERS = ADMIN_USERS_RAW
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/** Project root (one level up from server/). */
export const PROJECT_ROOT = join(__dirname, "..", "..");
/** LMDB database directory. */
export const DATA_LMDB = join(PROJECT_ROOT, "data", "lmdb");
/** Sync log files directory. */
export const SYNC_LOGS_DIR = resolve(PROJECT_ROOT, "data", "sync-logs");
/** Path to .env file for admin settings view. */
export const ENV_PATH = resolve(PROJECT_ROOT, ".env");

/** Secret for signing/verifying JWT access and refresh tokens. Must be set when auth is used. */
export const JWT_SECRET = process.env.JWT_SECRET || process.env.PHONEBOOK_JWT_SECRET || "";

/**
 * Exits the process if LDAP is required but not configured. Call from auth.js and sync.js entry.
 */
export function validateLdapConfig() {
  if (!HAS_LDAP_CONFIG && !TEST_MODE) {
    console.error(
      "Missing env vars for LDAP (LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PW, LDAP_BASE_DN)"
    );
    process.exit(1);
  }
}

/** Exits the process if JWT secret is not set (tokens would not persist across restarts). */
export function validateJwtSecret() {
  if (!JWT_SECRET || typeof JWT_SECRET !== "string" || JWT_SECRET.length < 32) {
    console.error(
      "JWT_SECRET (or PHONEBOOK_JWT_SECRET) must be set in .env with at least 32 characters for stateless JWT auth."
    );
    process.exit(1);
  }
}

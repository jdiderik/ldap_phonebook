/**
 * @fileoverview Extendable visibility and field filtering for non-admin /users list.
 * - shouldIncludeInPublicList: which records are visible to normal users (extendable rules).
 * - toPublicUser: reduce full user object to table-only fields for non-admin responses.
 * - toMinimalPublicRow: non-admin list shape with opaque id only (no dn/upn/SENSITIVE_KEYS).
 */
import { createHash } from "crypto";

/** Stable opaque id for a user (non-reversible). Used for favorites and list row identity without exposing dn/OU path. */
export function hashDn(dn) {
  if (!dn || typeof dn !== "string") return "";
  return createHash("sha256").update(dn, "utf8").digest("hex");
}

/** Minimal fields for non-admin list + favorites: no dn, upn, userPrincipalName, firstName, lastName, displayName. */
const MINIMAL_PUBLIC_KEYS = [
  "fullName",
  "location",
  "phone",
  "mobile",
  "email",
  "title",
  "department",
  "office",
];

/**
 * Reduces a list row (with display fields) to minimal public shape: opaque id + display only. No dn/upn/OU path.
 * @param {Object} row - Object with dn and addListRowDisplayFields output (fullName, location, phone, mobile, email, title, department, office).
 * @returns {Object} { id, fullName, location, phone, mobile, email, title, department, office }.
 */
export function toMinimalPublicRow(row) {
  if (!row || typeof row !== "object") return null;
  const id = hashDn(row.dn);
  const out = { id };
  for (const key of MINIMAL_PUBLIC_KEYS) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

/**
 * Whether a user record should be included in the public (non-admin) list.
 * Add more conditions here to exclude records (e.g. no department, no email).
 * @param {Object} user - Full user document from store.
 * @returns {boolean}
 */
export function shouldIncludeInPublicList(user) {
  if (!user || typeof user !== "object") return false;

  // Exclude users without a firstname (extendable: add more rules below)
  const first = user.firstName;
  const hasFirst = first != null && String(first).trim() !== "";
  if (!hasFirst) return false;

  // Add more exclusion rules as needed, e.g.:
  // if (!user.department) return false;
  // if (!user.email && !user.upn && !user.userPrincipalName) return false;

  return true;
}

/** Table-only fields for addListRowDisplayFields input; dn is used server-side only and stripped in toMinimalPublicRow. */
const PUBLIC_FIELDS = [
  "dn",
  "firstName",
  "lastName",
  "displayName",
  "title",
  "department",
  "office",
  "phones",
  "email",
  "upn",
  "userPrincipalName",
];

/**
 * Reduces a full user document to the minimal shape needed for the table (non-admin).
 * @param {Object} user - Full user document.
 * @param {string} [id] - Optional id (e.g. manual id) to include.
 * @returns {Object} Public user object (dn, id?, firstName, lastName, displayName, title, department, office, phones: { business, mobile }, email/upn/userPrincipalName).
 */
export function toPublicUser(user, id) {
  if (!user || typeof user !== "object") return null;
  const out = {};
  for (const key of PUBLIC_FIELDS) {
    if (key in user) out[key] = user[key];
  }
  if (id !== undefined) out.id = id;
  // Normalize phones to only business + mobile for table
  if (out.phones && typeof out.phones === "object") {
    out.phones = {
      business: out.phones.business ?? null,
      mobile: out.phones.mobile ?? null,
    };
  }
  return out;
}

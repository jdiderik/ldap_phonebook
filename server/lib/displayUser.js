/**
 * @fileoverview Server-side display helpers for list rows: fullName, location, phone, mobile, email.
 * Used so the API returns display-ready fields; the GUI only adds favorites when authenticated.
 */

/**
 * Normalizes a value to a single display string. Handles LDAP/API multi-valued attributes (arrays).
 * @param {string|string[]|number|object|null|undefined} v - Raw value.
 * @returns {string}
 */
function toDisplayString(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x == null ? "" : x)).join(" ").trim();
  return String(v).trim();
}

/**
 * Extracts the location OU from an LDAP Distinguished Name (e.g. CN=Name,OU=Dept,OU=Location,... → "Location").
 * @param {string} [dn] - Full LDAP DN string.
 * @returns {string}
 */
function extractLocationOU(dn) {
  if (!dn || typeof dn !== "string") return "";
  const parts = dn.split(",");
  const ous = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith("OU=")) ous.push(trimmed.substring(3));
  }
  return ous.length >= 2 ? ous[ous.length - 2] : "";
}

/**
 * Adds display-ready list-row fields to a user object (full or public shape).
 * The API returns these so the GUI does not need to compute fullName, location, phone, mobile, email.
 * @param {Object} user - User object (from store or toPublicUser).
 * @returns {Object} Same object with fullName, location, phone, mobile, email added.
 */
export function addListRowDisplayFields(user) {
  if (!user || typeof user !== "object") return user;
  const first = toDisplayString(user.firstName);
  const last = toDisplayString(user.lastName);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  const fullName = combined || toDisplayString(user.displayName) || "";
  const location = extractLocationOU(user.dn) || "";
  const phone = (user.phones && user.phones.business) != null ? String(user.phones.business) : "";
  const mobile = (user.phones && user.phones.mobile) != null ? String(user.phones.mobile) : "";
  const email =
    (user.email != null && user.email !== "")
      ? String(user.email)
      : (user.upn != null && user.upn !== "")
        ? String(user.upn)
        : (user.userPrincipalName != null && user.userPrincipalName !== "")
          ? String(user.userPrincipalName)
          : "";
  return {
    ...user,
    fullName,
    location,
    phone,
    mobile,
    email,
  };
}

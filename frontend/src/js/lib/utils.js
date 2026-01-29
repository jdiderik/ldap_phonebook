/**
 * @fileoverview Shared utilities for display strings, LDAP/DN parsing, and encoding.
 */

/**
 * Normalizes a value to a single display string. Handles LDAP/API multi-valued attributes (arrays).
 * @param {string|string[]|number|object|null|undefined} v - Raw value (string, array of strings, or other).
 * @returns {string} Trimmed string; arrays are joined with spaces; null/undefined returns "".
 * @example
 * toDisplayString("John") // "John"
 * toDisplayString(["John", "Doe"]) // "John Doe"
 * toDisplayString(null) // ""
 */
export function toDisplayString(v) {
	if (v == null) return "";
	if (Array.isArray(v)) return v.map((x) => String(x == null ? "" : x)).join(" ").trim();
	return String(v).trim();
}

/**
 * Extracts the location OU from an LDAP Distinguished Name (DN).
 * Expects format like CN=Name,OU=Dept,OU=Location,OU=Company,DC=example,DC=local
 * and returns the second OU from the right (e.g. "Location").
 * @param {string} [dn] - Full LDAP DN string.
 * @returns {string} Location OU value or "" if not found/invalid.
 */
export function extractLocationOU(dn) {
	if (!dn || typeof dn !== "string") return "";
	const parts = dn.split(",");
	const ous = [];
	for (const part of parts) {
		const trimmed = part.trim();
		if (trimmed.startsWith("OU=")) {
			ous.push(trimmed.substring(3));
		}
	}
	return ous.length >= 2 ? ous[ous.length - 2] : "";
}

/**
 * Encodes a DN for use in URLs (base64url: no +//, no trailing =).
 * @param {string} dn - LDAP Distinguished Name.
 * @returns {string} Base64url-encoded string.
 */
export function encodeDnBase64url(dn) {
	const base64 = btoa(unescape(encodeURIComponent(dn)));
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

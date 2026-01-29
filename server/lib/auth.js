/**
 * @fileoverview LDAP authentication and stateless JWT tokens (access + refresh). Tokens persist across server restarts.
 */
import { createSecretKey } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { Client } from "ldapts";
import { LDAP, HAS_LDAP_CONFIG, TEST_MODE, validateLdapConfig, validateJwtSecret, JWT_SECRET, ADMIN_USERS } from "./config.js";

validateLdapConfig();
validateJwtSecret();

const ACCESS_TTL_SEC = 60 * 60; // 1 hour
const REFRESH_TTL_SEC = 14 * 24 * 60 * 60; // 14 days
const JWT_ALG = "HS256";

function getJwtKey() {
  return createSecretKey(Buffer.from(JWT_SECRET, "utf8"));
}

function userToClaims(user) {
  return {
    sub: user.login,
    dn: user.dn,
    login: user.login,
    isAdmin: !!user.isAdmin,
    sAMAccountName: user.sAMAccountName ?? null,
    userPrincipalName: user.userPrincipalName ?? null,
  };
}

function claimsToUser(claims) {
  return {
    dn: claims.dn,
    login: claims.login ?? claims.sub,
    sAMAccountName: claims.sAMAccountName ?? null,
    userPrincipalName: claims.userPrincipalName ?? null,
    isAdmin: !!claims.isAdmin,
  };
}

function ldapEscape(value) {
  return value.replace(/[*()\\]/g, (c) => `\\${c}`);
}

async function findUserByLogin(login) {
  if (!HAS_LDAP_CONFIG) return null;
  const client = new Client({
    url: LDAP.url,
    timeout: 10_000,
    connectTimeout: 10_000,
  });
  try {
    await client.bind(LDAP.bindDN, LDAP.bindPW);
    const safeLogin = ldapEscape(login);
    const filter =
      "(&" +
      "(objectCategory=person)" +
      "(objectClass=user)" +
      `(|(sAMAccountName=${safeLogin})(userPrincipalName=${safeLogin}))` +
      ")";
    const { searchEntries } = await client.search(LDAP.baseDN, {
      scope: "sub",
      filter,
      attributes: ["distinguishedName", "sAMAccountName", "userPrincipalName", "memberOf"],
      paged: { pageSize: 1, pagePause: false },
    });
    if (!searchEntries || searchEntries.length === 0) return null;
    const entry = searchEntries[0];
    return {
      dn: entry.distinguishedName || entry.dn,
      sAMAccountName: entry.sAMAccountName,
      userPrincipalName: entry.userPrincipalName,
      memberOf: entry.memberOf,
    };
  } finally {
    try {
      await client.unbind();
    } catch {
      // ignore
    }
  }
}

async function verifyUserPassword(userDn, password) {
  if (!HAS_LDAP_CONFIG) return false;
  const client = new Client({
    url: LDAP.url,
    timeout: 10_000,
    connectTimeout: 10_000,
  });
  try {
    await client.bind(userDn, password);
    return true;
  } catch {
    return false;
  } finally {
    try {
      await client.unbind();
    } catch {
      // ignore
    }
  }
}

function isAdminUser(login) {
  if (!login || typeof login !== "string") return false;
  const normalized = login.trim().toLowerCase();
  return ADMIN_USERS.includes(normalized);
}

export async function authenticateUser(login, password) {
  if (!HAS_LDAP_CONFIG && TEST_MODE) {
    return {
      dn: "CN=Test Admin,OU=Test,DC=example,DC=local",
      login,
      sAMAccountName: login,
      userPrincipalName: `${login}@example.local`,
      testMode: true,
      isAdmin: true,
    };
  }
  const user = await findUserByLogin(login);
  if (!user) throw new Error("Invalid credentials");
  const ok = await verifyUserPassword(user.dn, password);
  if (!ok) throw new Error("Invalid credentials");
  return {
    dn: user.dn,
    login,
    sAMAccountName: user.sAMAccountName || null,
    userPrincipalName: user.userPrincipalName || null,
    isAdmin: isAdminUser(login),
  };
}

export async function createSession(user) {
  const key = getJwtKey();
  const claims = userToClaims(user);
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({ ...claims, type: "access" })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SEC)
    .sign(key);
  const refreshToken = await new SignJWT({ ...claims, type: "refresh" })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_TTL_SEC)
    .sign(key);
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEC };
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtKey(), {
      algorithms: [JWT_ALG],
      maxTokenAge: ACCESS_TTL_SEC,
    });
    if (payload.type !== "access") return null;
    return claimsToUser(payload);
  } catch {
    return null;
  }
}

export function verifyRefreshToken(refreshToken) {
  if (!refreshToken) return null;
  return jwtVerify(refreshToken, getJwtKey(), {
    algorithms: [JWT_ALG],
    maxTokenAge: REFRESH_TTL_SEC,
  })
    .then(({ payload }) => {
      if (payload.type !== "refresh") return null;
      return claimsToUser(payload);
    })
    .catch(() => null);
}

export async function createSessionFromRefresh(user, _oldRefreshToken) {
  return createSession(user);
}

export async function requireAuth(request, reply) {
  const auth = request.headers.authorization || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) {
    reply.code(401);
    return { error: "Missing or invalid Authorization header" };
  }
  const user = await verifySession(token);
  if (!user) {
    reply.code(401);
    return { error: "Invalid or expired token" };
  }
  request.user = user;
}

/**
 * Resolves optional Bearer token; does not send reply. Use for endpoints that vary by admin (e.g. GET /users).
 * @returns {Promise<{ user: object | null, isAdmin: boolean }>}
 */
export async function getOptionalUser(request) {
  const auth = request.headers.authorization || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) return { user: null, isAdmin: false };
  const user = await verifySession(token);
  if (!user) return { user: null, isAdmin: false };
  return { user, isAdmin: !!user.isAdmin };
}

/** Requires auth and user.isAdmin (in ADMIN_USERS). Use for admin page and manual users. */
export async function requireAdmin(request, reply) {
  const auth = request.headers.authorization || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) {
    reply.code(401);
    return { error: "Missing or invalid Authorization header" };
  }
  const user = await verifySession(token);
  if (!user) {
    reply.code(401);
    return { error: "Invalid or expired token" };
  }
  if (!user.isAdmin) {
    reply.code(403);
    return { error: "Admin required" };
  }
  request.user = user;
}

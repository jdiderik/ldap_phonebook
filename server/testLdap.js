/**
 * LDAP diagnostics script for Phonebook.
 *
 * Verifies:
 * - Can read LDAP config from .env
 * - Can bind with service account
 * - Can search for at least one user under LDAP_BASE_DN
 * - (Optional) Can find a specific test user and check group membership
 * - Dumps full LDAP user search to data/ldap-dump.json (optional broader base via LDAP_DUMP_BASE_DN)
 *
 * Usage (from project root):
 *   PHONEBOOK_TEST_MODE=0 node server/testLdap.js
 *
 * Optional env for extra checks:
 *   LDAP_TEST_USER=some.login       # sAMAccountName or userPrincipalName
 *   LDAP_TEST_PASS=SomePassword     # password for that user (to test user bind)
 *   LDAP_DUMP_BASE_DN=DC=...       # base DN for full dump (default: LDAP_BASE_DN); use a broader DN to include more of the directory
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { Client } from "ldapts";

const CFG = {
  url: process.env.LDAP_URL,
  bindDN: process.env.LDAP_BIND_DN,
  bindPW: process.env.LDAP_BIND_PW,
  baseDN: process.env.LDAP_BASE_DN,
  dumpBaseDN: process.env.LDAP_DUMP_BASE_DN || process.env.LDAP_BASE_DN,
  testUser: process.env.LDAP_TEST_USER,
  testPass: process.env.LDAP_TEST_PASS,
};

function printConfigSummary() {
  console.log("=== LDAP CONFIG SUMMARY ===");
  console.log("LDAP_URL           :", CFG.url || "(missing)");
  console.log("LDAP_BIND_DN       :", CFG.bindDN || "(missing)");
  console.log("LDAP_BASE_DN       :", CFG.baseDN || "(missing)");
  console.log("LDAP_TEST_USER     :", CFG.testUser ? CFG.testUser : "(not set)");
  console.log("LDAP_DUMP_BASE_DN  :", CFG.dumpBaseDN || "(same as LDAP_BASE_DN)");
  console.log("");
}

function ensureRequiredConfig() {
  const missing = [];
  if (!CFG.url) missing.push("LDAP_URL");
  if (!CFG.bindDN) missing.push("LDAP_BIND_DN");
  if (!CFG.bindPW) missing.push("LDAP_BIND_PW");
  if (!CFG.baseDN) missing.push("LDAP_BASE_DN");

  if (missing.length) {
    console.error("Missing required LDAP env vars:", missing.join(", "));
    console.error("Please check your .env file.");
    process.exit(1);
  }
}

async function testBindAsServiceAccount(client) {
  console.log("=== STEP 1: Bind as service account ===");
  try {
    await client.bind(CFG.bindDN, CFG.bindPW);
    console.log("OK: Successfully bound as service account.");
  } catch (err) {
    console.error("ERROR: Failed to bind as service account.");
    console.error("Details:", err);
    throw err;
  }
}

async function testBasicUserSearch(client) {
  console.log("\n=== STEP 2: Basic user search under base DN ===");
  const filter =
    "(&" +
    "(objectCategory=person)" +
    "(objectClass=user)" +
    "(!(objectClass=computer))" +
    ")";

  try {
    const { searchEntries } = await client.search(CFG.baseDN, {
      scope: "sub",
      filter,
      attributes: [
        "distinguishedName",
        "sAMAccountName",
        "userPrincipalName",
        "displayName",
        "memberOf",
        "userAccountControl",
      ],
      paged: { pageSize: 5, pagePause: false },
    });

    console.log(`OK: Search returned ${searchEntries.length} entries (showing up to 5).`);
    searchEntries.slice(0, 5).forEach((e, idx) => {
      console.log(`  [${idx}] DN        :`, e.distinguishedName || e.dn);
      console.log(`      sAMAccountName :`, e.sAMAccountName || "(none)");
      console.log(`      userPrincipal  :`, e.userPrincipalName || "(none)");
      console.log(`      displayName    :`, e.displayName || "(none)");
      console.log(`      userAccountCtrl:`, e.userAccountControl || "(none)");
      console.log("");
    });
  } catch (err) {
    console.error("ERROR: Failed during basic user search.");
    console.error("Filter used:", filter);
    console.error("Details:", err);
    throw err;
  }
}

/** Convert a value to a JSON-serializable form (Buffers -> base64). */
function toJsonSafe(value) {
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value != null && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

/** Full list of attributes used by sync (and a few extra) for a complete dump. */
const DUMP_ATTRIBUTES = [
  "distinguishedName",
  "objectGUID",
  "sAMAccountName",
  "userPrincipalName",
  "mail",
  "displayName",
  "givenName",
  "sn",
  "title",
  "department",
  "company",
  "physicalDeliveryOfficeName",
  "l",
  "st",
  "co",
  "telephoneNumber",
  "mobile",
  "ipPhone",
  "streetAddress",
  "postalCode",
  "memberOf",
  "manager",
  "lastLogon",
  "lastLogonTimestamp",
  "pwdLastSet",
  "whenChanged",
  "whenCreated",
  "userAccountControl",
];

async function dumpLdapToJson(client) {
  console.log("\n=== STEP 2b: Full LDAP dump to data/ldap-dump.json ===");
  const filter =
    "(&" +
    "(objectCategory=person)" +
    "(objectClass=user)" +
    "(!(objectClass=computer))" +
    ")";
  try {
    const { searchEntries } = await client.search(CFG.dumpBaseDN, {
      scope: "sub",
      filter,
      attributes: DUMP_ATTRIBUTES,
      paged: { pageSize: 1000, pagePause: false },
    });
    const dataDir = join(process.cwd(), "data");
    mkdirSync(dataDir, { recursive: true });
    const outPath = join(dataDir, "ldap-dump.json");
    const payload = {
      meta: {
        baseDN: CFG.dumpBaseDN,
        filter,
        count: searchEntries.length,
        dumpedAt: new Date().toISOString(),
      },
      entries: searchEntries.map((e) => toJsonSafe(e)),
    };
    writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(`OK: Wrote ${searchEntries.length} entries to ${outPath}`);
  } catch (err) {
    console.error("ERROR: Failed to dump LDAP to JSON.");
    console.error("Details:", err);
    throw err;
  }
}

function ldapEscape(value) {
  return value.replace(/[*()\\]/g, (c) => `\\${c}`);
}

async function testAdminGroupAndUserBind() {
  if (!CFG.testUser) {
    console.log(
      "\n=== STEP 3: Skipping specific user + admin group tests (LDAP_TEST_USER not set) ==="
    );
    return;
  }

  console.log("\n=== STEP 3: Test specific user lookup and (optional) user bind ===");
  console.log("Test user:", CFG.testUser);

  const client = new Client({
    url: CFG.url,
    timeout: 15_000,
    connectTimeout: 10_000,
  });

  try {
    await client.bind(CFG.bindDN, CFG.bindPW);

    const safeLogin = ldapEscape(CFG.testUser);
    const filter =
      "(&" +
      "(objectCategory=person)" +
      "(objectClass=user)" +
      `(|(sAMAccountName=${safeLogin})(userPrincipalName=${safeLogin}))` +
      ")";

    const { searchEntries } = await client.search(CFG.baseDN, {
      scope: "sub",
      filter,
      attributes: ["distinguishedName", "sAMAccountName", "userPrincipalName", "memberOf"],
      paged: { pageSize: 1, pagePause: false },
    });

    if (!searchEntries || searchEntries.length === 0) {
      console.error("ERROR: Could not find test user with filter:", filter);
      return;
    }

    const entry = searchEntries[0];
    const dn = entry.distinguishedName || entry.dn;
    console.log("OK: Found test user DN:", dn);
    console.log("    sAMAccountName   :", entry.sAMAccountName || "(none)");
    console.log("    userPrincipalName:", entry.userPrincipalName || "(none)");

    const memberOf = entry.memberOf;
    const groups = Array.isArray(memberOf) ? memberOf : memberOf ? [memberOf] : [];
    console.log("    Member of groups:");
    groups.forEach((g) => console.log("      -", g));

    const adminGroupCN = process.env.LDAP_ADMIN_GROUP_CN || "administratie";
    const needle = `CN=${adminGroupCN},`.toLowerCase();
    const inAdminGroup = groups.some(
      (g) => typeof g === "string" && g.toLowerCase().includes(needle)
    );
    console.log(
      `    Admin group (${adminGroupCN}) membership:`,
      inAdminGroup ? "YES" : "NO"
    );

    if (CFG.testPass) {
      console.log("\n    Testing bind with test user's own credentials...");
      const userClient = new Client({
        url: CFG.url,
        timeout: 15_000,
        connectTimeout: 10_000,
      });
      try {
        await userClient.bind(dn, CFG.testPass);
        console.log("    OK: User password is valid (bind succeeded).");
      } catch (err) {
        console.error(
          "    ERROR: Failed to bind as test user. Password may be incorrect or account locked."
        );
        console.error("    Details:", err);
      } finally {
        try {
          await userClient.unbind();
        } catch {
          // ignore
        }
      }
    } else {
      console.log(
        "    Skipping user password test (LDAP_TEST_PASS not set). To enable, set LDAP_TEST_PASS in .env."
      );
    }
  } finally {
    try {
      await client.unbind();
    } catch {
      // ignore
    }
  }
}

async function main() {
  printConfigSummary();
  ensureRequiredConfig();

  const client = new Client({
    url: CFG.url,
    timeout: 15_000,
    connectTimeout: 10_000,
  });

  try {
    await testBindAsServiceAccount(client);
    await testBasicUserSearch(client);
    await dumpLdapToJson(client);
  } catch (err) {
    console.error("\nLDAP diagnostics failed.");
    process.exitCode = 1;
  } finally {
    try {
      await client.unbind();
    } catch {
      // ignore
    }
  }

  try {
    await testAdminGroupAndUserBind();
  } catch (err) {
    console.error("\nAdditional user/admin tests failed.");
    console.error("Details:", err);
    process.exitCode = 1;
  }

  if (!process.exitCode) {
    console.log("\n=== ALL LDAP TESTS COMPLETED SUCCESSFULLY ===");
  } else {
    console.log("\n=== LDAP TESTS COMPLETED WITH ERRORS ===");
  }
}

main().catch((err) => {
  console.error("Unexpected error during LDAP diagnostics:", err);
  process.exit(1);
});


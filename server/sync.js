/**
 * Sync LDAP/AD users into a local LMDB store with DELTA SYNC (detect deletes + update index cleanly).
 * Env: LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PW, LDAP_BASE_DN
 */
import "dotenv/config";
import { mkdirSync } from "fs";
import { Client } from "ldapts";
import { createHash } from "crypto";
import pino from "pino";
import { join } from "path";
import { validateLdapConfig, LDAP, HAS_LDAP_CONFIG, TEST_MODE, SYNC_LOGS_DIR } from "./lib/config.js";
import {
  db,
  usersByDN,
  usersByGUID,
  indexDB,
  userTokensByDN,
  allDNs,
} from "./lib/db.js";

validateLdapConfig();

let log = pino({ level: process.env.LOG_LEVEL || "info" });

const UAC_DESCRIPTIONS = {
  1: "SCRIPT",
  2: "ACCOUNTDISABLE",
  8: "HOMEDIR_REQUIRED",
  16: "LOCKOUT",
  32: "PASSWD_NOTREQD",
  64: "PASSWD_CANT_CHANGE",
  128: "ENCRYPTED_TEXT_PWD_ALLOWED",
  256: "TEMP_DUPLICATE_ACCOUNT",
  512: "NORMAL_ACCOUNT",
  514: "Disabled Account",
  544: "Enabled, Password Not Required",
  546: "Disabled, Password Not Required",
  2048: "INTERDOMAIN_TRUST_ACCOUNT",
  4096: "WORKSTATION_TRUST_ACCOUNT",
  8192: "SERVER_TRUST_ACCOUNT",
  65536: "DONT_EXPIRE_PASSWORD",
  66048: "Enabled, Password Doesn't Expire",
  66050: "Disabled, Password Doesn't Expire",
  66082: "Disabled, Password Doesn't Expire & Not Required",
  131072: "MNS_LOGON_ACCOUNT",
  262144: "SMARTCARD_REQUIRED",
  262656: "Enabled, Smartcard Required",
  262658: "Disabled, Smartcard Required",
  262690: "Disabled, Smartcard Required, Password Not Required",
  328194: "Disabled, Smartcard Required, Password Doesn't Expire",
  328226: "Disabled, Smartcard Required, Password Doesn't Expire & Not Required",
  524288: "TRUSTED_FOR_DELEGATION",
  532480: "Domain controller",
  1048576: "NOT_DELEGATED",
  2097152: "USE_DES_KEY_ONLY",
  4194304: "DONT_REQ_PREAUTH",
  8388608: "PASSWORD_EXPIRED",
  16777216: "TRUSTED_TO_AUTH_FOR_DELEGATION",
  67108864: "PARTIAL_SECRETS_ACCOUNT",
};

function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function normalizeGUID(guid) {
  if (!guid) return null;
  if (Buffer.isBuffer(guid)) return createHash("sha1").update(guid).digest("hex");
  if (typeof guid === "string") {
    if (/^[0-9a-fA-F-]{36}$/.test(guid)) return guid.toLowerCase();
    return createHash("sha1").update(guid, "utf8").digest("hex");
  }
  return createHash("sha1").update(JSON.stringify(guid)).digest("hex");
}

function tokenize(...values) {
  const out = new Set();
  for (const v of values) {
    if (!v) continue;
    const s = String(v).toLowerCase();
    for (const t of s.split(/[^a-z0-9@.+-]+/i)) {
      if (!t) continue;
      if (t.length < 2) continue;
      out.add(t);
    }
  }
  return [...out];
}

function extractCN(dn) {
  if (!dn) return null;
  const m = /^CN=([^,]+),/i.exec(dn);
  return m ? m[1] : dn;
}

/** Convert Windows FILETIME (100-nanosecond intervals since 1601-01-01) to ISO string or null. */
function filetimeToIso(value) {
  if (value == null || value === 0 || value === "0") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n / 10000 - 11644473600000;
  return new Date(ms).toISOString();
}

async function addDNToToken(token, dn) {
  const current = (await indexDB.get(token)) || [];
  if (!current.includes(dn)) {
    current.push(dn);
    await indexDB.put(token, current);
  }
}

async function removeDNFromToken(token, dn) {
  const current = (await indexDB.get(token)) || [];
  const next = current.filter((x) => x !== dn);
  if (next.length === 0) {
    // keep DB smaller
    await indexDB.remove(token);
  } else if (next.length !== current.length) {
    await indexDB.put(token, next);
  }
}

async function updateIndexForUser(dn, newTokens) {
  const indexUpdateStart = Date.now();
  // Read previous tokens (if any)
  const prevTokens = (await userTokensByDN.get(dn)) || [];

  const prevSet = new Set(prevTokens);
  const newSet = new Set(newTokens);

  // tokens to add
  let tokensAdded = 0;
  for (const t of newSet) {
    if (!prevSet.has(t)) {
      await addDNToToken(t, dn);
      tokensAdded++;
    }
  }

  // tokens to remove
  let tokensRemoved = 0;
  for (const t of prevSet) {
    if (!newSet.has(t)) {
      await removeDNFromToken(t, dn);
      tokensRemoved++;
    }
  }

  await userTokensByDN.put(dn, [...newSet]);
  const indexUpdateMs = Date.now() - indexUpdateStart;
  if (indexUpdateMs > 50) {
    log.debug(
      { dn, indexUpdateMs, tokensAdded, tokensRemoved, totalTokens: newTokens.length },
      "Index update timing"
    );
  }
}

async function deleteUser(dn) {
  if (!dn) {
    return;
  }

  const doc = await usersByDN.get(dn);
  if (!doc) return;

  // Never delete manually added contacts as part of LDAP delta sync
  if (doc.isManual) {
    return;
  }

  // remove from usersByGUID if guid known
  if (doc.guid) await usersByGUID.remove(doc.guid);

  // remove tokens from inverted index
  const tokens = (await userTokensByDN.get(dn)) || [];
  for (const t of tokens) {
    await removeDNFromToken(t, dn);
  }
  await userTokensByDN.remove(dn);

  await usersByDN.remove(dn);
  await allDNs.remove(dn);
}

async function main() {
  if (!HAS_LDAP_CONFIG && TEST_MODE) {
    log.info("PHONEBOOK_TEST_MODE=1 and LDAP env missing; skipping LDAP sync.");
    await db.close();
    return;
  }

  const client = new Client({
    url: LDAP.url,
    timeout: 60_000,
    connectTimeout: 15_000,
  });

  // Build a set of known DNs BEFORE this run (for delta deletes)
  log.info("Phase 1: Loading known DNs from database…");
  const knownDNs = new Set();
  let emptyDNKeysInAllDNs = 0;
  for await (const { key } of allDNs.getKeys({})) {
    if (!key) {
      emptyDNKeysInAllDNs++;
      continue;
    }
    knownDNs.add(key);
  }
  log.info({ knownDNsCount: knownDNs.size, emptyDNKeysIgnored: emptyDNKeysInAllDNs }, "Known DNs loaded");

  const seenDNs = new Set();
  const syncStartTime = Date.now();

  mkdirSync(SYNC_LOGS_DIR, { recursive: true });
  const logFileName = `sync-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
  const logFilePath = join(SYNC_LOGS_DIR, logFileName);
  const fileStream = pino.destination(logFilePath);
  log = pino(
    { level: process.env.LOG_LEVEL || "info" },
    pino.multistream([{ stream: process.stdout }, { stream: fileStream }])
  );

  try {
    log.info({ url: LDAP.url }, "Phase 2: Binding to LDAP");
    await client.bind(LDAP.bindDN, LDAP.bindPW);

    const filter =
      "(&" +
      "(objectCategory=person)" +
      "(objectClass=user)" +
      "(!(objectClass=computer))" +
      "(!(userAccountControl:1.2.840.113556.1.4.803:=2))" +
      ")";

    const attributes = [
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

    log.info({ baseDN: LDAP.baseDN }, "Phase 2: Searching LDAP");
    const beforeSearch = Date.now();
    const { searchEntries } = await client.search(LDAP.baseDN, {
      scope: "sub",
      filter,
      attributes,
      paged: { pageSize: 1000, pagePause: false },
    });
    const searchMs = Date.now() - beforeSearch;
    log.info({ count: searchEntries.length, searchMs }, "Phase 2: LDAP search completed");

    let upserts = 0;
    let entriesSkippedNoDN = 0;
    let entriesSkippedManual = 0;
    const processingStart = Date.now();

    log.info({ totalEntries: searchEntries.length }, "Phase 3: Processing LDAP entries");

    for (const [index, e] of searchEntries.entries()) {
      const entryStart = Date.now();
      const dn = e.distinguishedName || e.dn;
      if (!dn) {
        entriesSkippedNoDN++;
        continue;
      }

      seenDNs.add(dn);

      // Progress at 0%, 10%, 20%, … 100%
      const total = searchEntries.length;
      const pct = total > 0 ? Math.floor((index / total) * 100) : 0;
      const prevPct = index > 0 && total > 0 ? Math.floor(((index - 1) / total) * 100) : -1;
      const atStart = index === 0;
      const atEnd = index === total - 1;
      const atPctMilestone = pct % 10 === 0 && (atStart || prevPct < pct);
      if (atPctMilestone || atEnd) {
        const elapsed = Date.now() - processingStart;
        const rate = index > 0 ? elapsed / index : 0;
        const remaining = total - index - 1;
        const etaMs = remaining > 0 ? Math.round(remaining * rate) : 0;
        log.info(
          { progress: `${pct}%`, index: index + 1, total, elapsedMs: elapsed, etaMs, upserts },
          "Phase 3: Processing entries"
        );
      }

      const guid = normalizeGUID(e.objectGUID);
      const memberOfDNs = toArray(e.memberOf);
      const memberOfCNs = memberOfDNs.map(extractCN);

      const uacRaw = e.userAccountControl;
      const uac = uacRaw != null ? Number(uacRaw) : null;
      const uacDescription = uac != null && UAC_DESCRIPTIONS[uac] ? UAC_DESCRIPTIONS[uac] : null;

      // If there is already a manually added contact under this key, do not overwrite it
      const checkStart = Date.now();
      const existingDoc = await usersByDN.get(dn);
      const checkMs = Date.now() - checkStart;
      if (checkMs > 10) {
        log.warn({ dn, checkMs }, "Slow database read detected");
      }
      if (existingDoc && existingDoc.isManual) {
        entriesSkippedManual++;
        continue;
      }

      const doc = {
        dn,
        guid,
        accountName: e.sAMAccountName || null,
        upn: e.userPrincipalName || null,
        email: e.mail || null,
        displayName: e.displayName || null,
        firstName: e.givenName || null,
        lastName: e.sn || null,
        title: e.title || null,
        department: e.department || null,
        company: e.company || null,
        office: e.physicalDeliveryOfficeName || null,
        location: {
          city: e.l || null,
          state: e.st || null,
          country: e.co || null,
          street: e.streetAddress || null,
          postalCode: e.postalCode || null,
        },
        phones: {
          business: e.telephoneNumber || null,
          mobile: e.mobile || null,
          ipPhone: e.ipPhone || null,
        },
        groups: { dns: memberOfDNs, names: memberOfCNs },
        managerDN: e.manager || null,
        lastLogon: filetimeToIso(e.lastLogon),
        lastLogonTimestamp: filetimeToIso(e.lastLogonTimestamp),
        passwordLastSet: filetimeToIso(e.pwdLastSet),
        whenChanged: e.whenChanged || null,
        whenCreated: e.whenCreated || null,
        uac,
        uacDescription,
        syncedAt: new Date().toISOString(),
      };

      // Upsert docs - batch writes together for better performance
      const writeStart = Date.now();
      // Use Promise.all to parallelize the three writes
      await Promise.all([
        usersByDN.put(dn, doc),
        guid ? usersByGUID.put(guid, doc) : Promise.resolve(),
        allDNs.put(dn, 1),
      ]);
      const writeMs = Date.now() - writeStart;
      // With noSync: true, writes should be very fast (< 5ms typically)
      // Only warn if significantly slower than expected
      if (writeMs > 10) {
        log.debug({ dn, writeMs }, "Database write timing");
      }

      // Incremental index update
      const indexStart = Date.now();
      const tokens = tokenize(
        doc.accountName,
        doc.upn,
        doc.email,
        doc.displayName,
        doc.firstName,
        doc.lastName,
        doc.title,
        doc.department,
        doc.company,
        doc.office,
        doc.location.city,
        doc.location.country,
        doc.phones.business,
        doc.phones.mobile,
        doc.phones.ipPhone,
        ...doc.groups.names
      );

      await updateIndexForUser(dn, tokens);
      const indexMs = Date.now() - indexStart;
      if (indexMs > 100) {
        log.warn({ dn, indexMs, tokenCount: tokens.length }, "Slow index update detected");
      }

      const entryMs = Date.now() - entryStart;
      if (entryMs > 200) {
        log.warn({ dn, entryMs, index }, "Slow entry processing detected");
      }

      upserts++;
    }

    const processingMs = Date.now() - processingStart;
    log.info(
      { upserts, processingMs, entriesSkippedNoDN, entriesSkippedManual },
      "Phase 3: Entry processing completed"
    );

    log.info({ knownDNsCount: knownDNs.size, seenDNsCount: seenDNs.size }, "Phase 4: Delta delete (removing users no longer in LDAP)");
    let deletes = 0;
    let emptyDNDeleteSkips = 0;
    const deleteStart = Date.now();
    for (const dn of knownDNs) {
      if (!dn) {
        emptyDNDeleteSkips++;
        continue;
      }
      if (!seenDNs.has(dn)) {
        await deleteUser(dn);
        deletes++;
        if (deletes % 25 === 0 && deletes > 0) {
          log.info({ progress: `${deletes} deleted`, deletes }, "Phase 4: Delta delete");
        }
      }
    }
    const deleteMs = Date.now() - deleteStart;
    log.info({ deletes, deleteMs }, "Phase 4: Delta delete completed");

    await db.put("meta:lastSync", {
      at: new Date().toISOString(),
      baseDN: LDAP.baseDN,
      upserts,
      deletes,
      ldapCount: searchEntries.length,
    });

    const totalMs = Date.now() - syncStartTime;
    log.info(
      {
        ldapResults: searchEntries.length,
        upserts,
        deletes,
        emptyDNKeysInAllDNs,
        emptyDNDeleteSkips,
        entriesSkippedNoDN,
        entriesSkippedManual,
        processingMs,
        deleteMs,
        totalMs,
      },
      "Sync complete – summary"
    );
  } catch (err) {
    // Check if this is a compression mismatch error
    if (err.message && err.message.includes("end of buffer not reached")) {
      log.error(
        {
          err,
          hint: "Database compression mismatch. Delete the database and resync: npm run reset:db",
        },
        "Sync failed - database format mismatch"
      );
    } else {
      log.error({ err }, "Sync failed");
    }
    process.exitCode = 1;
  } finally {
    try {
      if (typeof fileStream.end === "function") fileStream.end();
    } catch {
      // ignore
    }
    try {
      await client.unbind();
    } catch {
      // ignore
    }
    await db.close();
  }
}

main();


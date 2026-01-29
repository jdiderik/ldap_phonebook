/**
 * @fileoverview LMDB database: single environment and named stores for users, favorites, index, sync meta.
 */
import { open } from "lmdb";
import { mkdirSync } from "fs";
import { DATA_LMDB } from "./config.js";

mkdirSync(DATA_LMDB, { recursive: true });

/** Root LMDB database (meta, e.g. meta:lastSync). Also used to open named stores. */
export const db = open(DATA_LMDB, {
  maxDbs: 12,
});

/** Users keyed by DN. Value: full user document. */
export const usersByDN = db.openDB("usersByDN");

/** Users keyed by GUID (for sync dedup). Value: user document. */
export const usersByGUID = db.openDB("usersByGUID");

/** Favorites per logged-in user: key = user DN, value = JSON string of [{ id, displayName }]. */
export const userFavorites = db.openDB("userFavorites");

/** Inverted search index: key = token (word), value = array of DNs. */
export const indexDB = db.openDB("indexDB");

/** Per-user list of search tokens (for index updates on sync). Key = DN, value = string[] of tokens. */
export const userTokensByDN = db.openDB("userTokensByDN");

/** Set of all DNs (key = DN, value = 1) for delta sync. */
export const allDNs = db.openDB("allDNs");

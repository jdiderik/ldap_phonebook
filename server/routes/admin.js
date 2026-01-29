import { requireAdmin } from "../lib/auth.js";
import { readdir, readFile, stat } from "fs/promises";
import { join, resolve } from "path";
import { SYNC_LOGS_DIR, ENV_PATH } from "../lib/config.js";

const SENSITIVE_KEYS = /PASSWORD|SECRET|TOKEN|KEY|PW|BIND_PW/i;

/** Parse .env file and return the set of variable names defined in it. */
async function getEnvKeysFromFile(envPath) {
  try {
    const content = await readFile(envPath, "utf8");
    const keys = new Set();
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        if (key) keys.add(key);
      }
    }
    return keys;
  } catch (err) {
    if (err.code === "ENOENT") return new Set();
    throw err;
  }
}

export async function adminRoutes(fastify) {
  fastify.get("/admin/sync-logs", { preHandler: requireAdmin }, async (request, reply) => {
    let entries;
    try {
      entries = await readdir(SYNC_LOGS_DIR, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") {
        return { files: [] };
      }
      request.log.warn({ err }, "admin sync-logs list failed");
      reply.code(500);
      return { error: "Failed to list sync logs" };
    }
    const logFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".log"));
    const withStats = await Promise.all(
      logFiles.map(async (e) => {
        try {
          const s = await stat(join(SYNC_LOGS_DIR, e.name));
          return { name: e.name, size: s.size, mtimeMs: s.mtimeMs };
        } catch {
          return { name: e.name, size: null, mtimeMs: 0 };
        }
      })
    );
    const files = withStats
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 10)
      .map((f) => ({ name: f.name, size: f.size, mtime: new Date(f.mtimeMs).toISOString() }));
    return { files };
  });

  fastify.get(
    "/admin/sync-logs/:filename",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { filename } = request.params;
      if (!/^[a-zA-Z0-9._-]+\.log$/.test(filename)) {
        reply.code(400);
        return { error: "Invalid filename" };
      }
      const filePath = join(SYNC_LOGS_DIR, filename);
      const resolved = resolve(filePath);
      const baseResolved = resolve(SYNC_LOGS_DIR);
      if (!resolved.startsWith(baseResolved)) {
        reply.code(404);
        return { error: "Not found" };
      }
      try {
        const content = await readFile(filePath, "utf8");
        return { name: filename, content };
      } catch (err) {
        if (err.code === "ENOENT") {
          reply.code(404);
          return { error: "Log file not found" };
        }
        request.log.warn({ err }, "admin sync-log read failed");
        reply.code(500);
        return { error: "Failed to read log file" };
      }
    }
  );

  fastify.get("/admin/settings", { preHandler: requireAdmin }, async (request, reply) => {
    const envKeys = await getEnvKeysFromFile(ENV_PATH);
    const settings = {};
    for (const key of envKeys) {
      const value = process.env[key];
      if (value === undefined) continue;
      settings[key] = SENSITIVE_KEYS.test(key) ? "***" : value;
    }
    return { settings };
  });
}

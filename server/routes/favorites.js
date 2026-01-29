import { requireAuth } from "../lib/auth.js";
import { userFavorites } from "../lib/db.js";
import { hashDn } from "../lib/publicUserFilter.js";

function parseFavoritesRaw(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getFavoritesForUser(userDn) {
  const raw = userFavorites.get(userDn);
  const list = parseFavoritesRaw(raw);
  // Migrate old entries: if stored with dn, normalize to id (opaque hash)
  return list.map((f) => {
    if (f.id) return f;
    if (f.dn) return { id: hashDn(f.dn), displayName: f.displayName || "" };
    return f;
  });
}

function setFavoritesForUser(userDn, list) {
  const value = JSON.stringify(list);
  userFavorites.put(userDn, value);
}

function isValidOpaqueId(id) {
  return typeof id === "string" && /^[a-f0-9]{64}$/i.test(id);
}

export async function favoritesRoutes(fastify) {
  fastify.get("/favorites", { preHandler: requireAuth }, async (request) => {
    const userDn = request.user.dn;
    const favorites = getFavoritesForUser(userDn);
    return { favorites };
  });

  fastify.post("/favorites", { preHandler: requireAuth }, async (request, reply) => {
    const userDn = request.user.dn;
    const body = request.body || {};
    const { id, displayName } = body;
    if (!id || typeof id !== "string") {
      reply.code(400);
      return { error: "id is required" };
    }
    if (!isValidOpaqueId(id)) {
      reply.code(400);
      return { error: "Invalid id format" };
    }
    const list = getFavoritesForUser(userDn);
    if (list.some((f) => f.id === id)) {
      return { favorites: list };
    }
    list.push({ id, displayName: displayName || "" });
    setFavoritesForUser(userDn, list);
    reply.code(201);
    return { favorites: list };
  });

  fastify.delete("/favorites/:id", { preHandler: requireAuth }, async (request, reply) => {
    const userDn = request.user.dn;
    const { id } = request.params;
    if (!id || !isValidOpaqueId(id)) {
      reply.code(400);
      return { error: "Invalid id" };
    }
    const list = getFavoritesForUser(userDn).filter((f) => f.id !== id);
    setFavoritesForUser(userDn, list);
    reply.code(204);
    return null;
  });
}

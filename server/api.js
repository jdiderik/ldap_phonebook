/**
 * API server entry: Fastify app, CORS, routes, static frontend, listen.
 */
import "dotenv/config";
import Fastify from "fastify";
import { registerCors } from "./lib/cors.js";
import { registerStatic } from "./lib/static.js";
import { authRoutes } from "./routes/auth.js";
import { usersRoutes } from "./routes/users.js";
import { favoritesRoutes } from "./routes/favorites.js";
import { adminRoutes } from "./routes/admin.js";

const fastify = Fastify({ logger: true });

await fastify.register(registerCors);
await fastify.register(authRoutes, { prefix: "/api" });
await fastify.register(usersRoutes, { prefix: "/api" });
await fastify.register(favoritesRoutes, { prefix: "/api" });
await fastify.register(adminRoutes, { prefix: "/api" });
await fastify.register(registerStatic);

const port = Number(process.env.PORT || 8188);
const host = process.env.HOST || "0.0.0.0";
try {
  await fastify.listen({ port, host });
  fastify.log.info(`API listening on http://${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

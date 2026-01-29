/**
 * @fileoverview Static file serving and SPA fallback for the built frontend.
 */
import fastifyStatic from "@fastify/static";
import { join } from "path";
import { PROJECT_ROOT } from "./config.js";

const FRONTEND_WWW = join(PROJECT_ROOT, "frontend", "www");

/**
 * Registers static file serving from frontend/www and SPA fallback (index.html for non-API, non-asset routes).
 * @param {import("fastify").FastifyInstance} fastify
 */
export async function registerStatic(fastify) {
  await fastify.register(fastifyStatic, {
    root: FRONTEND_WWW,
    prefix: "/",
    index: ["index.html"],
  });
  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(request.url.split("?")[0]);
    if (hasExtension) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    reply.sendFile("index.html");
  });
}

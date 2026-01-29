/**
 * @fileoverview CORS for development: allow Parcel dev server (e.g. http://127.0.0.1:1234).
 */
import cors from "@fastify/cors";

/**
 * Registers CORS in non-production: allow requests from http://127.0.0.1:* and http://localhost:* (e.g. Parcel on 1234).
 * Pass the origin string explicitly so the plugin always sets Access-Control-Allow-Origin (required by Chromium with credentials).
 * @param {import("fastify").FastifyInstance} fastify
 */
export async function registerCors(fastify) {
  if (process.env.NODE_ENV === "production") return;
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (
        origin &&
        (origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://localhost:"))
      ) {
        cb(null, origin);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  });
}

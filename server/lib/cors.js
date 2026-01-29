/**
 * @fileoverview CORS hook for development: allow Parcel dev server origins.
 */

/**
 * Registers an onRequest hook that allows cross-origin requests from localhost/127.0.0.1 in non-production.
 * @param {import("fastify").FastifyInstance} fastify
 */
export async function registerCors(fastify) {
  if (process.env.NODE_ENV === "production") return;
  fastify.addHook("onRequest", (request, reply, done) => {
    const origin = request.headers.origin;
    if (
      origin &&
      (origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://localhost:"))
    ) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      reply.header("Access-Control-Allow-Credentials", "true");
    }
    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
    done();
  });
}

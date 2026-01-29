import {
  authenticateUser,
  createSession,
  createSessionFromRefresh,
  verifySession,
  verifyRefreshToken,
} from "../lib/auth.js";

export async function authRoutes(fastify) {
  fastify.post("/login", async (request, reply) => {
    const body = request.body || {};
    const { username, password } = body;

    if (!username || !password) {
      reply.code(400);
      return { error: "username and password are required" };
    }

    try {
      const user = await authenticateUser(username, password);
      const { accessToken, refreshToken, expiresIn } = await createSession(user);
      return { accessToken, refreshToken, user, expiresIn };
    } catch (err) {
      request.log.warn({ err }, "Authentication failed");
      reply.code(401);
      return { error: "Invalid credentials or insufficient permissions" };
    }
  });

  fastify.post("/refresh", async (request, reply) => {
    const body = request.body || {};
    const { refreshToken: token } = body;

    if (!token) {
      reply.code(400);
      return { error: "refreshToken is required" };
    }

    const user = await verifyRefreshToken(token);
    if (!user) {
      reply.code(401);
      return { error: "Invalid or expired refresh token" };
    }

    const { accessToken, refreshToken, expiresIn } = await createSessionFromRefresh(user, token);
    return { accessToken, refreshToken, user, expiresIn };
  });

  fastify.get("/me", async (request, reply) => {
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
    return { user };
  });
}


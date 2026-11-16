import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import fastifyCors from "@fastify/cors";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { workspaceRoutes } from "./modules/workspaces/workspaces.routes.js";
import { inviteRoutes } from "./modules/workspaces/invites.routes.js";
import { messageRoutes } from "./modules/messages/messages.routes.js";

export async function buildApp() {
  const server = Fastify({ logger: false });

  await server.register(fastifyCors, {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  });

  await server.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || "test_cookie_secret",
  });

  await server.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || "test_jwt_secret",
    cookie: {
      cookieName: "nexus_access",
      signed: false,
    },
  });

  await server.register(authRoutes, { prefix: "/api/auth" });
  await server.register(workspaceRoutes, { prefix: "/api/workspaces" });
  await server.register(inviteRoutes, { prefix: "/api/workspaces" });
  await server.register(messageRoutes, { prefix: "/api/messages" });

  server.get("/health", async (_request, reply) => {
    await prisma.$queryRaw`SELECT 1`;
    const redisPong = await redis.ping();
    return reply.status(200).send({
      status: "ok",
      services: { postgres: "connected", redis: redisPong === "PONG" ? "connected" : "error" },
    });
  });

  return server;
}
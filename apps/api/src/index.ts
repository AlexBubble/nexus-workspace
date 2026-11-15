import "dotenv/config";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import fastifyCors from "@fastify/cors";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { setupSocketServer } from "./lib/socket.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { workspaceRoutes } from "./modules/workspaces/workspaces.routes.js";
import { messageRoutes } from "./modules/messages/messages.routes.js";
import { inviteRoutes } from "./modules/workspaces/invites.routes.js";

const server = Fastify({
  logger: true,
});

// 1. Настраиваем CORS (разрешаем запросы с фронтенда и передачу HttpOnly кук)
await server.register(fastifyCors, {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
});

// 2. Подключаем работу с куками
await server.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET || "fallback_cookie_secret",
});

// 3. Подключаем JWT и учим его читать токен из куки "nexus_access"
await server.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || "fallback_jwt_secret",
  cookie: {
    cookieName: "nexus_access",
    signed: false,
  },
});

// 4. Регистрируем все доменные REST-маршруты
await server.register(authRoutes, { prefix: "/api/auth" });
await server.register(workspaceRoutes, { prefix: "/api/workspaces" });
await server.register(inviteRoutes, { prefix: "/api/workspaces" });
await server.register(messageRoutes, { prefix: "/api/messages" });

// 5. Инициализируем WebSocket-сервер поверх Fastify
const io = setupSocketServer(server);

// Эндпоинт проверки здоровья системы (Healthcheck)
server.get("/health", async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisPong = await redis.ping();

    return reply.status(200).send({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        postgres: "connected",
        redis: redisPong === "PONG" ? "connected" : "error",
      },
    });
  } catch (error) {
    server.log.error(error);
    return reply.status(503).send({
      status: "error",
      message: "Database connection failed",
    });
  }
});

// Корректное завершение работы сервера (Graceful Shutdown)
const gracefulShutdown = async () => {
  console.log("\nShutting down gracefully...");
  io.close();
  await server.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Запуск сервера на порту 4000
const start = async () => {
  try {
    const port = Number(process.env.API_PORT) || 4000;
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 Nexus API & WebSocket server running on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

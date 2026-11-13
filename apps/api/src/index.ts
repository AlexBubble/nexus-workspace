import "dotenv/config";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { authRoutes } from "./modules/auth/auth.routes.js";

const server = Fastify({
  logger: true,
});

// 1. Подключаем работу с куками
await server.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET || "fallback_cookie_secret",
});

// 2. Подключаем JWT и учим его автоматически читать токен из куки "nexus_token"
await server.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || "fallback_jwt_secret",
  cookie: {
    cookieName: "nexus_access",
    signed: false,
  },
});

// 3. Регистрируем маршруты аутентификации по адресу /api/auth/*
await server.register(authRoutes, { prefix: "/api/auth" });

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
    console.log(`🚀 Nexus API server running on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

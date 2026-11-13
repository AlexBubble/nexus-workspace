import "dotenv/config";
import Fastify from "fastify";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";

const server = Fastify({
  logger: true,
});

// Эндпоинт проверки здоровья системы (Healthcheck)
server.get("/health", async (_request, reply) => {
  try {
    // 1. Проверяем связь с PostgreSQL легким запросом SELECT 1
    await prisma.$queryRaw`SELECT 1`;

    // 2. Проверяем связь с Redis командой PING
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

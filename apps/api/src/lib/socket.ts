import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { FastifyInstance } from "fastify";
import { SendMessageSchema } from "@nexus/types";
import { redis } from "./redis.js";
import { prisma } from "./prisma.js";

// Вспомогательная функция для извлечения конкретной куки из заголовка Cookie
function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const target = cookies.find((c) => c.startsWith(`${name}=`));
  return target ? target.slice(name.length + 1) : null;
}

export function setupSocketServer(fastify: FastifyInstance) {
  // Создаем дубликаты подключения Redis специально для Pub/Sub адаптера
  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true, // Обязательно для передачи HttpOnly кук при рукопожатии WebSocket!
    },
    adapter: createAdapter(pubClient, subClient),
  });

  // Middleware аутентификации при подключении к WebSocket
  io.use((socket, next) => {
    try {
      const token = parseCookie(socket.handshake.headers.cookie, "nexus_access");
      if (!token) {
        return next(new Error("Unauthorized: токен отсутствует"));
      }

      // Проверяем подпись JWT через встроенный верификатор Fastify
      const payload = fastify.jwt.verify<{ userId: string; email: string; type: string }>(token);
      if (payload.type !== "access") {
        return next(new Error("Unauthorized: неверный тип токена"));
      }

      // Сохраняем данные пользователя прямо в объект сокета
      socket.data.user = payload;
      next();
    } catch {
      next(new Error("Unauthorized: недействительный токен"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { userId: string; email: string };
    fastify.log.info(`🔌 WebSocket connected: ${user.email} (${socket.id})`);

    // Событие 1: Пользователь заходит в комнату (канал)
    socket.on("join_channel", async (channelId: string) => {
      // Проверяем, имеет ли пользователь доступ к этому каналу
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: {
          workspace: {
            include: { members: { where: { userId: user.userId } } },
          },
        },
      });

      if (channel && channel.workspace.members.length > 0) {
        await socket.join(`channel:${channelId}`);
        fastify.log.info(`User ${user.email} joined channel:${channelId}`);
      }
    });

    // Событие 2: Пользователь отправляет новое сообщение в канал
    socket.on("send_message", async (rawData: unknown, callback?: (res: unknown) => void) => {
      const parseResult = SendMessageSchema.safeParse(rawData);
      if (!parseResult.success) {
        callback?.({ error: "Некорректные данные сообщения" });
        return;
      }

      const { channelId, content } = parseResult.data;

      // Сохраняем сообщение в PostgreSQL (надежное хранилище)
      const savedMessage = await prisma.message.create({
        data: {
          content,
          channelId,
          authorId: user.userId,
        },
        include: {
          author: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Мгновенно рассылаем сообщение всем участникам комнаты через Redis Pub/Sub!
      io.to(`channel:${channelId}`).emit("new_message", savedMessage);

      // Подтверждаем отправителю, что сообщение доставлено
      callback?.({ status: "ok", message: savedMessage });
    });

    socket.on("disconnect", () => {
      fastify.log.info(`🔌 WebSocket disconnected: ${user.email}`);
    });
  });

  return io;
}

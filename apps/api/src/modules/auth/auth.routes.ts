import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { RegisterSchema, LoginSchema } from "@nexus/types";
import { prisma } from "../../lib/prisma.js";
import { redis } from "../../lib/redis.js";

const ACCESS_TOKEN_TTL_SEC = 60 * 15; // 15 минут
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 дней

// Выпускаем пару токенов, сохраняем Refresh в Redis и ставим две HttpOnly куки
async function issueTokensAndCookies(
  server: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; email: string }
) {
  const tokenId = randomUUID(); // Уникальный ID конкретной сессии/устройства

  // 1. Генерируем короткий Access Token (15 мин)
  const accessToken = server.jwt.sign(
    { userId: user.id, email: user.email, type: "access" },
    { expiresIn: ACCESS_TOKEN_TTL_SEC }
  );

  // 2. Генерируем долгий Refresh Token (7 дней) с привязкой к tokenId
  const refreshToken = server.jwt.sign(
    { userId: user.id, email: user.email, type: "refresh", jti: tokenId },
    { expiresIn: REFRESH_TOKEN_TTL_SEC }
  );

  // 3. Записываем разрешение на эту сессию в Redis (с автоматическим удалением через 7 дней)
  // Ключ: refresh:<userId>:<tokenId>, значение: "valid"
  await redis.set(
    `refresh:${user.id}:${tokenId}`,
    "valid",
    "EX",
    REFRESH_TOKEN_TTL_SEC
  );

  // 4. Ставим куку доступа (работает на всем сайте)
  reply.setCookie("nexus_access", accessToken, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: ACCESS_TOKEN_TTL_SEC,
  });

  // 5. Ставим куку обновления (браузер отправляет её ТОЛЬКО на маршруты /api/auth)
  reply.setCookie("nexus_refresh", refreshToken, {
    path: "/api/auth",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: REFRESH_TOKEN_TTL_SEC,
  });
}

// Middleware (фейс-контроль) для защиты приватных маршрутов
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Проверяем подпись и срок действия токена из куки "nexus_access"
    await request.jwtVerify();

    // Защита от подмены: убеждаемся, что прислали именно access-токен, а не refresh
    if (request.user.type !== "access") {
      return reply.status(401).send({ message: "Неверный тип токена" });
    }
  } catch {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Сессия истекла или требуется вход",
    });
  }
}

export async function authRoutes(server: FastifyInstance) {
  // 1. РЕГИСТРАЦИЯ
  server.post("/register", async (request, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { email, password, fullName } = parseResult.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.status(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Пользователь с таким email уже существует",
      });
    }

    const passwordHash = await argon2.hash(password);

    const user = await prisma.user.create({
      data: { email, passwordHash, fullName },
      select: { id: true, email: true, fullName: true, avatarUrl: true, createdAt: true },
    });

    await issueTokensAndCookies(server, reply, user);

    return reply.status(201).send({ user });
  });

  // 2. ВХОД В СИСТЕМУ
  server.post("/login", async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parseResult.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ message: "Неверный email или пароль" });
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      return reply.status(401).send({ message: "Неверный email или пароль" });
    }

    await issueTokensAndCookies(server, reply, user);

    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
    });
  });

  // 3. ОБНОВЛЕНИЕ ТОКЕНОВ (Refresh Token Rotation)
  server.post("/refresh", async (request, reply) => {
    const refreshCookie = request.cookies.nexus_refresh;
    if (!refreshCookie) {
      return reply.status(401).send({ message: "Отсутствует refresh-токен" });
    }

    try {
      // Вручную проверяем подпись refresh-токена
      const payload = server.jwt.verify<{
        userId: string;
        email: string;
        type: string;
        jti?: string;
      }>(refreshCookie);

      if (payload.type !== "refresh" || !payload.jti) {
        return reply.status(401).send({ message: "Некорректный refresh-токен" });
      }

      const redisKey = `refresh:${payload.userId}:${payload.jti}`;
      const isSessionActive = await redis.get(redisKey);

      // Если сессии нет в Redis — значит токен уже был использован или отозван при выходе!
      if (!isSessionActive) {
        return reply.status(401).send({ message: "Сессия отозвана. Войдите заново" });
      }

      // Удаляем старый одноразовый refresh-токен из Redis (Ротация!)
      await redis.del(redisKey);

      // Выдаем свежую пару токенов и кук
      await issueTokensAndCookies(server, reply, {
        id: payload.userId,
        email: payload.email,
      });

      return reply.status(200).send({ message: "Токены успешно обновлены" });
    } catch {
      return reply.status(401).send({ message: "Refresh-токен недействителен или истек" });
    }
  });

  // 4. ПРОФИЛЬ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
  server.get("/me", { preHandler: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, email: true, fullName: true, avatarUrl: true, createdAt: true },
    });

    if (!user) {
      return reply.status(404).send({ message: "Пользователь не найден" });
    }

    return reply.status(200).send({ user });
  });

  // 5. ВЫХОД ИЗ СИСТЕМЫ (Отзыв сессии в Redis + очистка обеих кук)
  server.post("/logout", async (request, reply) => {
    const refreshCookie = request.cookies.nexus_refresh;
    if (refreshCookie) {
      try {
        const payload = server.jwt.verify<{ userId: string; jti?: string }>(refreshCookie);
        if (payload.jti) {
          // Мгновенно аннулируем сессию в Redis
          await redis.del(`refresh:${payload.userId}:${payload.jti}`);
        }
      } catch {
        // Игнорируем ошибку, если токен уже истек — просто чистим куки
      }
    }

    reply.clearCookie("nexus_access", { path: "/" });
    reply.clearCookie("nexus_refresh", { path: "/api/auth" });

    return reply.status(200).send({ message: "Вы успешно вышли из системы" });
  });
}

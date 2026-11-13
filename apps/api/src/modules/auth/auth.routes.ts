import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import argon2 from "argon2";
import { RegisterSchema, LoginSchema } from "@nexus/types";
import { prisma } from "../../lib/prisma.js";

// Вспомогательная функция для установки защищенной HttpOnly куки
function setAuthCookie(reply: FastifyReply, token: string) {
  reply.setCookie("nexus_token", token, {
    path: "/",
    httpOnly: true, // Запрещает доступ из JavaScript (защита от XSS)
    sameSite: "strict", // Защита от CSRF-атак
    secure: process.env.NODE_ENV === "production", // В продакшене передавать только по HTTPS
    maxAge: 60 * 60 * 24 * 7, // Срок жизни куки: 7 дней (в секундах)
  });
}

// Middleware (хук) для защиты приватных маршрутов
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Fastify-jwt сам достанет токен из куки "nexus_token" и проверит подпись
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Необходимо войти в систему",
    });
  }
}

export async function authRoutes(server: FastifyInstance) {
  // 1. РЕГИСТРАЦИЯ
  server.post("/register", async (request, reply) => {
    // Валидируем входящее тело запроса через нашу общую Zod-схему
    const parseResult = RegisterSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { email, password, fullName } = parseResult.data;

    // Проверяем, не занят ли email
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return reply.status(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Пользователь с таким email уже существует",
      });
    }

    // Хэшируем пароль через Argon2id
    const passwordHash = await argon2.hash(password);

    // Сохраняем пользователя в PostgreSQL
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Генерируем JWT и прячем в HttpOnly куку
    const token = server.jwt.sign({ userId: user.id, email: user.email });
    setAuthCookie(reply, token);

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

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Важный прием безопасности: не подсказываем хакеру, что именно неверно (email или пароль)
    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Неверный email или пароль",
      });
    }

    // Сравниваем введенный пароль с хэшем Argon2 из базы
    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Неверный email или пароль",
      });
    }

    const token = server.jwt.sign({ userId: user.id, email: user.email });
    setAuthCookie(reply, token);

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

  // 3. ПОЛУЧЕНИЕ ПРОФИЛЯ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ (Защищенный маршрут)
  server.get("/me", { preHandler: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ message: "Пользователь не найден" });
    }

    return reply.status(200).send({ user });
  });

  // 4. ВЫХОД ИЗ СИСТЕМЫ
  server.post("/logout", async (_request, reply) => {
    reply.clearCookie("nexus_token", { path: "/" });
    return reply.status(200).send({ message: "Вы успешно вышли из системы" });
  });
}

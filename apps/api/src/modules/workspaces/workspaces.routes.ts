import type { FastifyInstance } from "fastify";
import { CreateWorkspaceSchema, CreateChannelSchema } from "@nexus/types";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../auth/auth.routes.js";

export async function workspaceRoutes(server: FastifyInstance) {
  // Вешаем проверку токена (authenticate) сразу на ВСЕ маршруты внутри этого модуля!
  server.addHook("preHandler", authenticate);

  // 1. СОЗДАНИЕ НОВОГО РАБОЧЕГО ПРОСТРАНСТВА (в транзакции)
  server.post("/", async (request, reply) => {
    // Проверяем входные данные через общую Zod-схему
    const parseResult = CreateWorkspaceSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { name, slug } = parseResult.data;
    const userId = request.user.userId;

    // Проверяем, не занят ли этот slug другой командой
    const existingWorkspace = await prisma.workspace.findUnique({
      where: { slug },
    });

    if (existingWorkspace) {
      return reply.status(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Рабочее пространство с таким URL (slug) уже занято",
      });
    }

    // АТОМАРНАЯ ТРАНЗАКЦИЯ: создаем команду, владельца и канал #general одним неделимым блоком
    const workspace = await prisma.$transaction(async (tx) => {
      // Шаг А: создаем само рабочее пространство
      const newWorkspace = await tx.workspace.create({
        data: {
          name,
          slug,
        },
      });

      // Шаг Б: добавляем текущего пользователя как OWNER (Владельца)
      await tx.workspaceMember.create({
        data: {
          userId,
          workspaceId: newWorkspace.id,
          role: "OWNER",
        },
      });

      // Шаг В: создаем стартовый общий канал #general
      const defaultChannel = await tx.channel.create({
        data: {
          name: "general",
          workspaceId: newWorkspace.id,
          isPrivate: false,
        },
      });

      return {
        ...newWorkspace,
        channels: [defaultChannel],
      };
    });

    return reply.status(201).send({ workspace });
  });

  // 2. ПОЛУЧЕНИЕ ВСЕХ РАБОЧИХ ПРОСТРАНСТВ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
  server.get("/", async (request, reply) => {
    const userId = request.user.userId;

    // Ищем все записи членства пользователя и подтягиваем данные самих команд
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: {
              select: { members: true, channels: true }, // Считаем кол-во участников и каналов
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    // Форматируем ответ в удобный плоский вид для фронтенда
    const workspaces = memberships.map((m) => ({
      ...m.workspace,
      myRole: m.role,
    }));

    return reply.status(200).send({ workspaces });
  });

  // 3. ПОЛУЧЕНИЕ КОНКРЕТНОГО РАБОЧЕГО ПРОСТРАНСТВА ПО SLUG
  server.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
    const { slug } = request.params;
    const userId = request.user.userId;

    const workspace = await prisma.workspace.findUnique({
      where: { slug },
      include: {
        channels: {
          orderBy: { createdAt: "asc" },
        },
        members: {
          where: { userId }, // Проверяем, состоит ли текущий пользователь в этой команде
        },
      },
    });

    // Если команды нет ИЛИ пользователь не является её участником — отдаем 404/403
    if (!workspace) {
      return reply.status(404).send({ message: "Рабочее пространство не найдено" });
    }

    const currentMember = workspace.members[0];
    if (!currentMember) {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "У вас нет доступа к этому рабочему пространству",
      });
    }

    return reply.status(200).send({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.createdAt,
        myRole: currentMember.role,
        channels: workspace.channels,
      },
    });
  });

  // 4. СОЗДАНИЕ НОВОГО КАНАЛА ВНУТРИ РАБОЧЕГО ПРОСТРАНСТВА (Только для OWNER и ADMIN)
  server.post<{ Params: { slug: string } }>("/:slug/channels", async (request, reply) => {
    const { slug } = request.params;
    const userId = request.user.userId;

    const parseResult = CreateChannelSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { slug },
      include: {
        members: { where: { userId } },
      },
    });

    if (!workspace) {
      return reply.status(404).send({ message: "Рабочее пространство не найдено" });
    }

    // АВТОРИЗАЦИЯ (RBAC): проверяем роль пользователя в этой команде
    const member = workspace.members[0];
    if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Создавать каналы могут только владельцы и администраторы",
      });
    }

    try {
      const channel = await prisma.channel.create({
        data: {
          name: parseResult.data.name,
          isPrivate: parseResult.data.isPrivate,
          workspaceId: workspace.id,
        },
      });

      return reply.status(201).send({ channel });
    } catch {
      // Сработает наш уникальный индекс @@unique([workspaceId, name]), если канал уже есть
      return reply.status(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `Канал #${parseResult.data.name} уже существует в этой команде`,
      });
    }
  });
}

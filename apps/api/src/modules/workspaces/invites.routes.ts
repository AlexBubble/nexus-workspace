import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../auth/auth.routes.js";

export async function inviteRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // 1. POST /api/workspaces/:slug/invites — Создание ссылки-приглашения (RBAC: OWNER / ADMIN)
  server.post<{ Params: { slug: string } }>("/:slug/invites", async (request, reply) => {
    const { slug } = request.params;
    const userId = request.user.userId;

    const workspace = await prisma.workspace.findUnique({
      where: { slug },
      include: { members: { where: { userId } } },
    });

    if (!workspace) {
      return reply.status(404).send({ message: "Рабочее пространство не найдено" });
    }

    const member = workspace.members[0];
    if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
      return reply.status(403).send({ message: "Создавать приглашения могут только OWNER и ADMIN" });
    }

    // Генерируем криптографически случайный 24-символьный код со сроком жизни 24 часа
    const code = crypto.randomBytes(12).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    const invite = await prisma.workspaceInvite.create({
      data: {
        code,
        expiresAt,
        workspaceId: workspace.id,
      },
    });

    return reply.status(201).send({ code: invite.code, expiresAt: invite.expiresAt });
  });

  // 2. POST /api/workspaces/join/:code — Вступление в команду по ссылке
  server.post<{ Params: { code: string } }>("/join/:code", async (request, reply) => {
    const { code } = request.params;
    const userId = request.user.userId;

    const invite = await prisma.workspaceInvite.findUnique({
      where: { code },
      include: { workspace: true },
    });

    if (!invite) {
      return reply.status(404).send({ message: "Ссылка-приглашение недействительна" });
    }

    if (invite.expiresAt < new Date()) {
      return reply.status(410).send({ message: "Срок действия приглашения истек" });
    }

    // Проверяем через составной уникальный ключ, не состоит ли человек уже в команде
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: invite.workspaceId,
        },
      },
    });

    if (!existingMember) {
      await prisma.workspaceMember.create({
        data: {
          userId,
          workspaceId: invite.workspaceId,
          role: "MEMBER",
        },
      });
    }

    return reply.status(200).send({
      workspace: {
        id: invite.workspace.id,
        name: invite.workspace.name,
        slug: invite.workspace.slug,
      },
    });
  });
}
import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../auth/auth.routes.js";

export async function messageRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // GET /api/messages/:channelId?cursor=<messageId>&limit=50
  server.get<{
    Params: { channelId: string };
    Querystring: { cursor?: string; limit?: string };
  }>("/:channelId", async (request, reply) => {
    const { channelId } = request.params;
    const { cursor } = request.query;
    const limit = Math.min(Number(request.query.limit) || 50, 100); // Максимум 100 за раз
    const userId = request.user.userId;

    // 1. Проверяем, существует ли канал и состоит ли пользователь в этой команде (RBAC)
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        workspace: {
          include: {
            members: { where: { userId } },
          },
        },
      },
    });

    if (!channel) {
      return reply.status(404).send({ message: "Канал не найден" });
    }

    if (channel.workspace.members.length === 0) {
      return reply.status(403).send({ message: "Нет доступа к этому каналу" });
    }

    // 2. Загружаем сообщения с курсорной пагинацией (от новых к старым)
    const messages = await prisma.message.findMany({
      where: { channelId },
      take: limit,
      // Если передан cursor — пропускаем сам курсор (skip: 1) и берем сообщения старше него
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
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

    // Определяем ID следующего курсора для дальнейшей прокрутки вверх
    const nextCursor = messages.length === limit ? messages[messages.length - 1]?.id : null;

    // Разворачиваем массив в хронологическом порядке (от старых к новым) для отображения в чате
    return reply.status(200).send({
      messages: messages.reverse(),
      nextCursor,
    });
  });
}

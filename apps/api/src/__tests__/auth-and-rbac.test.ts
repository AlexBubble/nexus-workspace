import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

describe("Nexus API Integration Tests (Auth, Transactions & RBAC)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const testEmail = `test_${Date.now()}@nexus.dev`;
  const memberEmail = `member_${Date.now()}@nexus.dev`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    // Очищаем тестовых пользователей после прогона тестов
    await prisma.user.deleteMany({
      where: { email: { in: [testEmail, memberEmail] } },
    });
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
  });

  it("GET /health — должен подтвердить подключение к PostgreSQL и Redis", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.services.postgres).toBe("connected");
    expect(body.services.redis).toBe("connected");
  });

  it("POST /api/auth/register — должен создать пользователя и выдать две HttpOnly куки", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: testEmail,
        password: "StrongPassword123",
        fullName: "Test Owner",
      },
    });

    expect(res.statusCode).toBe(201);
    const cookies = res.cookies;
    const accessCookie = cookies.find((c) => c.name === "nexus_access");
    const refreshCookie = cookies.find((c) => c.name === "nexus_refresh");

    expect(accessCookie).toBeDefined();
    expect(accessCookie?.httpOnly).toBe(true);
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);
  });

  it("GET /api/workspaces — должен отклонить запрос без куки со статусом 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/workspaces",
    });

    expect(res.statusCode).toBe(401);
  });

  it("RBAC — обычный участник (MEMBER) не может создавать каналы в команде (403 Forbidden)", async () => {
    // 1. Логинимся как владелец (Owner)
    const ownerLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: testEmail, password: "StrongPassword123" },
    });
    const ownerToken = ownerLogin.cookies.find((c) => c.name === "nexus_access")!.value;

    // 2. Создаем команду и генерируем приглашение
    const slug = `team-${Date.now()}`;
    await app.inject({
      method: "POST",
      url: "/api/workspaces",
      cookies: { nexus_access: ownerToken },
      payload: { name: "Test Team", slug },
    });

    const inviteRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${slug}/invites`,
      cookies: { nexus_access: ownerToken },
    });
    const inviteCode = inviteRes.json().code;

    // 3. Регистрируем второго пользователя и вступаем по приглашению (получает роль MEMBER)
    const memberReg = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: memberEmail, password: "StrongPassword123", fullName: "Regular Member" },
    });
    const memberToken = memberReg.cookies.find((c) => c.name === "nexus_access")!.value;

    await app.inject({
      method: "POST",
      url: `/api/workspaces/join/${inviteCode}`,
      cookies: { nexus_access: memberToken },
    });

    // 4. Пытаемся создать канал от имени MEMBER — ожидаем 403 Forbidden!
    const createChannelRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${slug}/channels`,
      cookies: { nexus_access: memberToken },
      payload: { name: "forbidden-channel" },
    });

    expect(createChannelRes.statusCode).toBe(403);
  });
});
# Этап 1: Вырезаем только нужные для API пакеты монорепозитория
FROM node:22-alpine AS pruner
WORKDIR /app
RUN corepack enable
COPY . .
RUN npx turbo prune @nexus/api --docker

# Этап 2: Устанавливаем зависимости и компилируем TypeScript
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @nexus/api db:generate
RUN pnpm --filter @nexus/api build

# Этап 3: Чистый легкий Production-контейнер
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]

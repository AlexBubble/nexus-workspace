# Nexus — Real-Time Enterprise Team Workspace

**Nexus** is a high-performance, real-time collaborative workspace platform (inspired by Slack & Linear) engineered with a scalable **Monorepo architecture**, end-to-end type safety, and banking-grade authentication.

## 🏗 Architecture & Tech Stack

- **Monorepo & Build System:** `pnpm workspaces` + `Turborepo` (remote/local build caching & dependency graph)
- **End-to-End Type Safety:** Shared `@nexus/types` package powered by **Zod** (runtime validation) & **TypeScript 5** (compile-time safety)
- **Backend (`apps/api`):**
  - **Framework:** `Fastify 5` (Node.js)
  - **Database & ORM:** `PostgreSQL 17` + `Prisma ORM` (ACID transactions, composite B-Tree indexes, cursor-based pagination)
  - **Real-Time Engine:** `Socket.io` + `@socket.io/redis-adapter` (horizontal scaling via **Redis Pub/Sub**)
  - **Security:** `Argon2id` password hashing, Dual-Token Rotation (`Access` 15m + `Refresh` 7d stored in **Redis**), `HttpOnly` + `SameSite=Strict` cookies, RBAC authorization
- **Frontend (`apps/web`):**
  - **Framework:** `Next.js 15` (App Router) + `React 19` + `Tailwind CSS v4`
  - **State Management:** `TanStack Query v5` (server state caching) + `Zustand` (client UI state)
  - **Network Layer:** `Axios` with request queuing & automatic silent token rotation interceptors
- **Infrastructure:** `Docker Compose` (`postgres:17-alpine`, `redis:7-alpine`) & Multi-stage Production `Dockerfile`

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js >= 22
- pnpm >= 10 (`corepack enable`)
- Docker & Docker Compose

### 2. Setup Environment & Infrastructure
```bash
cp .env.example .env
docker compose up -d
```

### 3. Install Dependencies & Run Migrations
```bash
pnpm install
pnpm --filter @nexus/types build
pnpm --filter @nexus/api db:migrate
```

### 4. Start Full-Stack Monorepo
```bash
pnpm dev
```
- **Frontend:** `http://localhost:3000`
- **Backend API & WebSocket:** `http://localhost:4000`
- **Healthcheck:** `http://localhost:4000/health`

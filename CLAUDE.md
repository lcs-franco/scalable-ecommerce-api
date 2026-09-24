# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies (pnpm 11, Node 22)
pnpm install

# Start infrastructure (Postgres 16, Redis 7, Kafka KRaft)
docker compose up -d

# Run all services in dev mode (tsx watch)
pnpm dev

# Run a single service
pnpm --filter @ecommerce/user-service dev

# Build shared packages (must build before running services)
pnpm build

# Type check entire monorepo
pnpm typecheck

# Lint
pnpm lint

# Run all tests
pnpm test

# Run tests for a single service
pnpm --filter @ecommerce/order-service test

# Run a single test file
cd services/user-service && npx vitest run src/__tests__/auth.test.ts

# Generate Drizzle migrations (per service)
pnpm --filter @ecommerce/product-service db:generate

# Seed database (per service)
pnpm --filter @ecommerce/product-service seed
```

## Architecture

**Monorepo** using pnpm workspaces with three shared packages and seven microservices (4 implemented, 3 placeholder).

### Shared Packages (`packages/`)

| Package             | Purpose                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `@ecommerce/auth`   | Fastify plugin wrapping `@fastify/jwt`. Routes opt out via `{ config: { skipAuth: true } }` |
| `@ecommerce/events` | Kafka topic constants, Zod event schemas, `createProducer`/`createConsumer` factories       |
| `@ecommerce/logger` | Pino logger factory with per-service configuration                                          |

Packages must be built (`pnpm build`) before services can import them.

### Services (`services/`)

| Service              | Port | Database                | Status      |
| -------------------- | ---- | ----------------------- | ----------- |
| user-service         | 3001 | PostgreSQL (user_db)    | Implemented |
| product-service      | 3002 | PostgreSQL (product_db) | Implemented |
| cart-service         | 3003 | Redis                   | Implemented |
| order-service        | 3004 | PostgreSQL (order_db)   | Implemented |
| api-gateway          | 3000 | —                       | Placeholder |
| payment-service      | 3005 | PostgreSQL (payment_db) | Placeholder |
| notification-service | 3006 | —                       | Placeholder |

### Communication Patterns

**Synchronous (HTTP):** Service-to-service calls use `x-internal-token` header (shared secret from `INTERNAL_SERVICE_TOKEN` env var), not JWT. Client factories live in each service (e.g., `createProductClient`, `createCartClient`).

**Asynchronous (Kafka):** Events use Zod-validated schemas from `@ecommerce/events`. Topics: `user.registered`, `order.placed`, `order.status-changed`, `payment.confirmed`, `payment.failed`. Poison messages (bad JSON/schema) are logged and skipped, not retried.

### Key Patterns

- **Service factory pattern:** Each service exports `buildApp(deps)` taking injected dependencies (db, clients, publishers). Entry point (`index.ts`) wires everything together.
- **Saga pattern:** Order placement uses compensating transactions — `saga()` registers rollback functions and executes them in LIFO order on failure.
- **Domain errors:** Services define `ApplicationError` subclasses with `statusCode` and `code`. The error handler maps `ZodError → 400`, `ApplicationError → custom status`, unknown → 500.
- **Config validation:** Each service validates env vars at startup with Zod. Missing/invalid → process exits immediately.

### Database

Single Postgres container hosts 4 logical databases (`init-databases.sh` creates them). Each service connects only to its own DB. Drizzle ORM handles migrations and queries. Migrations live in each service's `drizzle/` directory.

## Testing

- **Framework:** Vitest with 30s timeout, serial file execution
- **Location:** `services/*/src/__tests__/*.test.ts`
- **Pattern:** `createTestApp()` helper builds Fastify instance with real Postgres/Redis and mock Kafka publishers. `cleanDb()` resets tables between tests.
- **CI:** GitHub Actions runs typecheck → build → test. Postgres and Redis run as service containers; Kafka is not available in CI.

## Environment Setup

Copy `.env.example` to `.env` and adjust values. Key variables: `DATABASE_URL`, `JWT_SECRET` (min 32 chars), `KAFKA_BROKER`, `REDIS_URL`, `INTERNAL_SERVICE_TOKEN`.

## Issue Tracking

Issues are tracked as Markdown files in `issues/`. MVP milestones live under `issues/mvp-platform/`; standalone issues are at the top level.

## CI

GitHub Actions on PRs to main: typecheck, build, test. Single workflow per PR (previous runs cancelled). Node 22, pnpm 11.

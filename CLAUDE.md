# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies (pnpm 11, Node 22)
pnpm install

# Whole platform in containers (root .env from .env.example; gateway :3000, Mailpit :8025)
docker compose up --build

# Daily development: same, with hot reload of services/*/src (packages/* changes need a rebuild)
pnpm dev

# Infrastructure only, enough for the tests (Postgres 16, Redis 7, Kafka KRaft + topics, Mailpit)
docker compose up -d postgres redis kafka kafka-init mailpit

# Build shared packages (tests on the host import their dist)
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

# Re-run a seed (seeds also run on every compose up)
docker compose run --rm product-seed
```

## Architecture

**Monorepo** using pnpm workspaces with four shared packages and seven microservices.

### Shared Packages (`packages/`)

| Package             | Purpose                                                                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ecommerce/auth`   | Fastify plugin wrapping `@fastify/jwt`. Routes opt out via `{ config: { skipAuth: true } }`; path prefixes via `publicPrefixes`. `{ config: { internal: true } }` routes require `x-internal-token` (plugin option `internalToken`) instead of JWT |
| `@ecommerce/docs`   | `docsPlugin`: OpenAPI (Swagger + Scalar) at `DOCS_PREFIX` (`/docs`) from Zod route schemas; `schema: { hide: true }` or `config: { internal: true }` hides a route                                                                                 |
| `@ecommerce/events` | Kafka topic constants, Zod event schemas, `createProducer`/`createConsumer` factories; transactional outbox (`outbox` table, `enqueue`, `createOutboxRelay`) under `@ecommerce/events/outbox`; test helpers under `@ecommerce/events/testing`      |
| `@ecommerce/logger` | Pino logger factory with per-service configuration                                                                                                                                                                                                 |

Packages must be built (`pnpm build`) before services can import them.

### Services (`services/`)

| Service              | Port | Database                | Status      |
| -------------------- | ---- | ----------------------- | ----------- |
| user-service         | 3001 | PostgreSQL (user_db)    | Implemented |
| product-service      | 3002 | PostgreSQL (product_db) | Implemented |
| cart-service         | 3003 | Redis                   | Implemented |
| order-service        | 3004 | PostgreSQL (order_db)   | Implemented |
| api-gateway          | 3000 | Redis (rate limits)     | Implemented |
| payment-service      | 3005 | PostgreSQL (payment_db) | Implemented |
| notification-service | 3006 | —                       | Implemented |

### Communication Patterns

**Gateway:** Clients call `api-gateway` (`/api/...`). It proxies only the routes in its allowlist (`services/api-gateway/src/routes/table.ts`, everything else is 404), checks access (`public | user | admin`), rate limits via Redis, and forwards `Authorization` plus `X-User-Id`/`X-User-Role`/`X-Request-Id`. Services still verify the JWT themselves. A new client-facing route must be added to the allowlist.

**Synchronous (HTTP):** Service-to-service calls use `x-internal-token` header (shared secret from `INTERNAL_SERVICE_TOKEN` env var), not JWT. The receiving route declares `config: { internal: true }` and `authPlugin` checks the token. Client factories live in each service (e.g., `createProductClient`, `createCartClient`).

**Asynchronous (Kafka):** Events use Zod-validated schemas from `@ecommerce/events`. Topics: `user.registered`, `order.placed`, `order.status-changed`, `payment.confirmed`, `payment.failed`. Poison messages (bad JSON/schema) are logged and skipped, not retried. Services never publish from a request: they `enqueue(tx, topic, data, { key })` into their own `outbox` table in the same transaction as the state change, and a relay in the service process publishes it (at-least-once, message key = entity id, header `event-id` = outbox row id). An adopting service re-exports `outbox` from its `db/schema.ts` so `db:generate` migrates it.

### Key Patterns

- **Service factory pattern:** Each service exports `buildApp(deps)` taking injected dependencies (db, clients, publishers). Entry point (`index.ts`) wires everything together.
- **Saga pattern:** Order placement uses compensating transactions — `saga()` registers rollback functions and executes them in LIFO order on failure.
- **Domain errors:** Services define `ApplicationError` subclasses with `statusCode` and `code`. The error handler maps `ZodError → 400`, `ApplicationError → custom status`, unknown → 500.
- **Config validation:** Each service validates env vars at startup with Zod. Missing/invalid → process exits immediately.
- **Health:** every service exposes `GET /health` (liveness, `skipAuth`, hidden from docs). Startup is fail-fast (migrations and Kafka connect run before `listen`), so compose uses it as the readiness signal.

### Containers

One root `Dockerfile` builds every service (`--build-arg SERVICE=<dir>`): `tsc` → `dist/`, then `pnpm deploy --prod --legacy` into a self-contained folder run with `node dist/index.js`. Target `dev` runs `tsx watch` for `docker-compose.dev.yml`. Each service's `package.json` `files` (`dist`, plus `drizzle` where present) decides what the deploy copies, as do the `files` of `packages/*`. In `docker-compose.yml`, services get env through `environment:` with internal hostnames; secrets come from the root `.env`. `kafka-init` creates the topics (keep its list in sync with `Topics`); `user-seed` / `product-seed` run once after their service is healthy. A new service needs an entry in compose (and in the dev override).

### Database

Single Postgres container hosts 4 logical databases (`init-databases.sh` creates them). Each service connects only to its own DB. Drizzle ORM handles migrations and queries. Migrations live in each service's `drizzle/` directory.

## Testing

- **Framework:** Vitest with 30s timeout, serial file execution
- **Location:** `services/*/src/__tests__/*.test.ts`
- **Pattern:** `createTestApp()` helper builds Fastify instance with real Postgres/Redis. Events are asserted as rows in the service's `outbox` table (`outboxEvents()`). `cleanDb()` resets tables (including `outbox`) between tests.
- **Kafka tests:** `kafka.test.ts` (and notification's `consumers.test.ts`) run the outbox relay / `setupConsumers` against the real broker with `@ecommerce/events/testing` (`createTestConsumer`, `collectEvents`). Topics are shared, so filter received events by an id the test owns. Run them against the infra-only command above, not `pnpm dev`: the running services' consumer groups would also consume test messages.
- **CI:** GitHub Actions runs typecheck → build → test. Postgres and Redis run as service containers; Kafka starts from `docker-compose.yml` (`kafka` + `kafka-init`).

## Environment Setup

Copy the root `.env.example` to `.env` and set `STRIPE_SECRET_KEY`. It is the only env file: compose reads it and passes each service its variables through `environment:` (internal hostnames are fixed in `docker-compose.yml`). Services do not run on the host; tests use defaults from their `__tests__/helpers.ts`.

## Issue Tracking

Issues are tracked in GitHub Issues (`gh issue list`, `gh issue view <n>`). MVP work is grouped under the `MVP Platform` milestone. Triage (state) labels: `needs-triage` (maintainer needs to evaluate), `needs-info` (waiting on reporter), `ready-to-implement` (fully specced, ready to be implemented), `wontfix` (will not be actioned). Category labels: `enhancement`, `bug`, `refactor`, `documentation`. Reference issues in PRs with `Closes #<n>` so they close on merge.

## CI

GitHub Actions on PRs to main: typecheck, build, test. Single workflow per PR (previous runs cancelled). Node 22, pnpm 11.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Code follows `CODING_STANDARDS.md` (judgement rules; mechanical ones are lint). Code review reads it too.

## Build & Development Commands

```bash
# Install dependencies (pnpm 11, Node 22)
pnpm install

# Whole platform in containers (root .env from .env.example; gateway :3000, Mailpit :8025)
docker compose up --build

# Daily development: same, with hot reload of services/*/src (packages/* changes need a rebuild)
pnpm dev

# pnpm dev plus the observability profile (Grafana :3100, Prometheus :9090); stop with pnpm obs:down
pnpm obs

# Infrastructure only, enough for the tests (Postgres 16, Redis 7, Kafka KRaft + topics, Mailpit; no .env needed)
pnpm infra

# Stop the infrastructure (keeps volumes)
pnpm infra:down

# Build shared packages (tests on the host import their dist)
pnpm build

# Type check entire monorepo
pnpm typecheck

# Lint
pnpm lint

# Lint without writing (what CI runs)
pnpm lint:check

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

**Monorepo** using pnpm workspaces with eight shared packages and seven microservices.

### Shared Packages (`packages/`)

| Package              | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ecommerce/auth`    | Fastify plugin wrapping `@fastify/jwt`. Routes opt out via `{ config: { skipAuth: true } }`; path prefixes via `publicPrefixes`. `{ config: { internal: true } }` routes require `x-internal-token` (plugin option `internalToken`) instead of JWT                                                                                                                                                                                                        |
| `@ecommerce/db`      | `createDb({ url, schema, log })` → `{ db, pool }` (Drizzle on node-postgres; logs `pool` `'error'` events, so an idle client dropped by Postgres doesn't crash the process), `Database<typeof schema>` type, `runMigrations(db, migrationsFolder)`; used only by the Postgres services                                                                                                                                                                    |
| `@ecommerce/docs`    | `docsPlugin`: OpenAPI (Swagger + Scalar) at `DOCS_PREFIX` (`/docs`) from Zod route schemas; `schema: { hide: true }` or `config: { internal: true }` hides a route                                                                                                                                                                                                                                                                                        |
| `@ecommerce/events`  | Kafka topic constants, Zod event schemas, `createKafka({ service, broker, log })` (KafkaJS client logging through Pino), `createProducer`/`createConsumer` factories; transactional outbox (`outbox` table, `enqueue`, `createOutboxRelay`) under `@ecommerce/events/outbox`; test helpers under `@ecommerce/events/testing`                                                                                                                              |
| `@ecommerce/http`    | `registerErrorHandler(app)` (the shared Fastify error handler), `ApplicationError` base for domain errors, `HttpError` base with `Unauthorized` / `Forbidden`, and `CommonErrorCode` (`VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL_SERVER_ERROR`)                                                                                                                                                                                                 |
| `@ecommerce/logger`  | `createLogger({ service, level })`: Pino instance (pino-pretty outside production)                                                                                                                                                                                                                                                                                                                                                                        |
| `@ecommerce/service` | Service skeleton: `runService` (process lifecycle), `createServiceApp` (Fastify preamble), `baseConfig` / `loadConfig` and the `jwtSecret` / `internalServiceToken` Zod fields (see Key Patterns)                                                                                                                                                                                                                                                         |
| `@ecommerce/metrics` | prom-client on the global registry: `metricsPlugin` (RED histogram by method, route template, status; 404s as `__unmatched__`), `startMetricsServer({ port, service })` (separate `node:http` server for `/metrics`, sets the `service` label and default Node metrics), `observePgPool`, `observeOutbox` (fed by `outboxBacklog` from `@ecommerce/events/outbox`), `consumerMetrics` (for `createConsumer`'s `onProcessed`), `upstreamMetrics` (gateway) |

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
| notification-service | 3006 | Redis (event dedupe)    | Implemented |

### Communication Patterns

**Gateway:** Clients call `api-gateway` (`/api/...`). It proxies only the routes in its allowlist (`services/api-gateway/src/routes/table.ts`, everything else is 404), checks access (`public | user | admin`), rate limits via Redis, and forwards `Authorization` plus `X-User-Id`/`X-User-Role`/`X-Request-Id`. Services still verify the JWT themselves. A new client-facing route must be added to the allowlist.

**Synchronous (HTTP):** Service-to-service calls use `x-internal-token` header (shared secret from `INTERNAL_SERVICE_TOKEN` env var), not JWT. The receiving route declares `config: { internal: true }` and `authPlugin` checks the token. Client factories live in each service (e.g., `createProductClient`, `createCartClient`).

**Request id:** every app (gateway included) passes `genReqId: genRequestId` to Fastify and calls `registerRequestId(app)` (both from `@ecommerce/http`): a valid incoming UUID `x-request-id` becomes `request.id` (the `reqId` in logs) and is echoed back, otherwise a new one is generated. Client methods take an optional trailing `requestId` (routes pass `request.id`) and send it with `requestIdHeaders(requestId)`.

**Asynchronous (Kafka):** Events use Zod-validated schemas from `@ecommerce/events`. Topics: `user.registered`, `order.placed`, `order.status-changed`, `payment.confirmed`, `payment.failed`. Poison messages (bad JSON/schema) are logged and skipped, not retried. Services never publish from a request: they `enqueue(tx, topic, data, { key })` into their own `outbox` table in the same transaction as the state change, and a relay in the service process publishes it (at-least-once, message key = entity id, header `event-id` = outbox row id). The relay also purges published rows after 7 days (unpublished rows are never deleted). An adopting service re-exports `outbox` from its `db/schema.ts` so `db:generate` migrates it.

### Key Patterns

- **Service factory pattern:** Each service exports `buildApp(deps)` taking injected dependencies (logger, db, clients, processors) and builds its Fastify instance with `createServiceApp({ name, logger, internalToken?, docs?, auth? })` (`@ecommerce/service`): Zod compilers, `registerErrorHandler`, `registerRequestId`, `metricsPlugin`, `docsPlugin` and `authPlugin` (both on by default; `DOCS_PREFIX` public), and `GET /health`. notification-service has no `buildApp` and calls `createServiceApp` with docs and auth off; the gateway builds its own app. `buildApp` of a Postgres service runs `runMigrations(db, MIGRATIONS_FOLDER)` first, so tests get migrations too.
- **Process lifecycle:** every `index.ts` is one `await runService({ name, config }, setup)`. It creates the logger from `name` and `LOG_LEVEL`; `setup({ log, onClose, afterListen })` opens resources, shares `log` with Fastify, `createKafka`, consumers and the relay, and returns the app; then `runService` starts the metrics server on `METRICS_PORT` and listens on `PORT`. Each resource registers `onClose(name, close)` as soon as it opens; work that must start after `listen` (the outbox relay) goes in `afterListen`. On SIGTERM/SIGINT, and on any startup failure (logged `fatal`), it closes the app, the metrics server, then the resources in LIFO order; every close runs even if one fails, each is logged, and the process exits 1 if any failed or the total exceeded `shutdownTimeoutMs` (8s, under Docker's 10s grace period), 0 otherwise. Tests drive it through the `process` option (`on`, `exit`).
- **Saga pattern:** Order placement uses compensating transactions — `saga()` registers rollback functions and executes them in LIFO order on failure.
- **Domain errors:** Services define subclasses of `ApplicationError` (from `@ecommerce/http`) with `statusCode` and a domain `code` from their own `ErrorCode`; HTTP errors (`Unauthorized`, `Forbidden`) come from the package. `registerErrorHandler(app)` maps `ZodError → 400`, `ApplicationError` / `HttpError → statusCode`, Fastify errors below 500 keep their status, unknown → 500. The api-gateway keeps its own handler (`HttpError → statusCode`, everything else → 500) on the package's `HttpError` and `CommonErrorCode`.
- **Config validation:** each service's config is `loadConfig(baseConfig({ port }).extend({ ... }))`: `baseConfig` holds `PORT` (the service's default), `METRICS_PORT` and `LOG_LEVEL`; services add `JWT_SECRET: jwtSecret` / `INTERNAL_SERVICE_TOKEN: internalServiceToken` only if they use them. `loadConfig` parses `process.env` at import; on failure it prints each invalid variable and exits 1. No `dotenv`: compose passes the env (it stays a dev dependency for `drizzle.config.ts`).
- **Metrics:** `createServiceApp` registers `metricsPlugin`; `runService` starts the metrics server on `METRICS_PORT` (9464) before `listen`, and the setup wires the helpers it owns (pg pool, outbox, consumer, upstream). `/metrics` is never on the app port: the metrics port is only on the compose network, so it has no token.
- **Health:** every service exposes `GET /health` (liveness, `skipAuth`, hidden from docs). Startup is fail-fast (migrations and Kafka connect run before `listen`), so compose uses it as the readiness signal.
- **Style:** Blank lines between steps are enforced by `@stylistic/padding-line-between-statements`; `pnpm lint` fixes them.

### Containers

One root `Dockerfile` builds every service (`--build-arg SERVICE=<dir>`): `tsc` → `dist/`, then `pnpm deploy --prod --legacy` into a self-contained folder run with `node dist/index.js`. Target `dev` runs `tsx watch` for `docker/dev.yaml`. Each service's `package.json` `files` (`dist`, plus `drizzle` where present) decides what the deploy copies, as do the `files` of `packages/*`. The root `compose.yaml` only sets the project name (`ecommerce`) and includes `docker/infra.yaml` (Postgres, Redis, Kafka, `kafka-init`, Mailpit; `name: ecommerce` too, so both share containers and volumes) and `docker/services.yaml` (services and seeds). Included files resolve relative paths against `docker/`; `docker/dev.yaml`, applied with `-f`, resolves them against the root. In `docker/services.yaml`, services get env through `environment:` with internal hostnames; secrets come from the root `.env`. `kafka-init` creates the topics (keep its list in sync with `Topics`); `user-seed` / `product-seed` run once after their service is healthy. A new service needs an entry in `docker/services.yaml` (and in `docker/dev.yaml`). `docker/observability.yaml` (profile `observability`: Prometheus, Grafana, cAdvisor, postgres/redis/kafka exporters, each with `cpus`/`mem_limit`) is included by both projects; Prometheus scrapes static targets (`docker/observability/prometheus.yml`, a new service needs a line there) every 5s, and Grafana (anonymous admin) provisions the versioned dashboard `docker/observability/grafana/dashboards/platform.json`. `stress/compose.yaml` is a second project (`ecommerce-stress`) including the same files with host ports shifted, gateway rate limits raised and the fake payment processor instead of Stripe (`stress/stress.env`), `cpus`/`mem_limit` on every container (`stress/*.override.yaml`), Toxiproxy on the order→product/cart, services→Postgres and services→Kafka paths (`stress/toxiproxy.json`, toxics from `stress/lib/toxics.ts`), a pure-SQL absurd-scale seed and a k6 harness (`stress/scripts/attack.sh <scenario>` runs `stress/scenarios/<scenario>.ts` from the k6 image, then checks invariants in SQL); `stress/` is a workspace package (`@types/k6`, own tsconfig, in `pnpm typecheck`). See `stress/README.md`.

### Database

Single Postgres container hosts 4 logical databases (`init-databases.sh` creates them). Each service connects only to its own DB. Drizzle ORM handles migrations and queries. Migrations live in each service's `drizzle/` directory.

## Testing

- **Framework:** Vitest with 30s timeout, serial file execution
- **Location:** `services/*/src/__tests__/*.test.ts`
- **Pattern:** `createTestApp()` helper builds Fastify instance with real Postgres/Redis and a `silent` logger. Events are asserted as rows in the service's `outbox` table (`outboxEvents()`). `cleanDb()` resets tables (including `outbox`) between tests.
- **Kafka tests:** `kafka.test.ts` (and notification's `consumers.test.ts`) run the outbox relay / `setupConsumers` against the real broker with `@ecommerce/events/testing` (`createTestConsumer`, `collectEvents`). Topics are shared, so filter received events by an id the test owns. Run them against `pnpm infra`, not `pnpm dev`: the running services' consumer groups would also consume test messages.
- **CI:** GitHub Actions runs lint, typecheck and build in parallel, then test (after typecheck and build). The test job starts `docker/infra.yaml` while dependencies install, then `pnpm infra` waits for health and creates the topics.

## Environment Setup

Copy the root `.env.example` to `.env` and set `STRIPE_SECRET_KEY`. It is the only env file: compose reads it and passes each service its variables through `environment:` (internal hostnames are fixed in `docker/services.yaml`). Services do not run on the host; tests use defaults from their `__tests__/helpers.ts`. `docker/infra.yaml` needs no `.env` (its Postgres defaults match `.env.example`); run on its own it reads `docker/.env`, not the root one, so root overrides such as `POSTGRES_PORT` apply only through `compose.yaml`.

## Issue Tracking

Issues are tracked in GitHub Issues (`gh issue list`, `gh issue view <n>`). MVP work is grouped under the `MVP Platform` milestone. Triage (state) labels: `needs-triage` (maintainer needs to evaluate), `needs-info` (waiting on reporter), `ready-to-implement` (fully specced, ready to be implemented), `wontfix` (will not be actioned). Category labels: `enhancement`, `bug`, `refactor`, `documentation`. Reference issues in PRs with `Closes #<n>` so they close on merge.

## CI

GitHub Actions on PRs to main: lint, typecheck and build in parallel, then test. Single workflow per PR (previous runs cancelled). Node 22, pnpm 11.

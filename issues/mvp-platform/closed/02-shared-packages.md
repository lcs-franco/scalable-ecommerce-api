# 02 — Shared packages: logger, auth, events

**What to build:** Three shared packages that all services depend on. `@ecommerce/logger` wraps Pino with service-name tagging and request-id correlation. `@ecommerce/auth` provides JWT sign/verify functions and a Fastify plugin that decorates requests with user context. `@ecommerce/events` defines Zod schemas for every Kafka topic, typed producer/consumer factory functions using KafkaJS, and topic name constants. All three packages build, export types correctly, and are importable from any service workspace.

**Blocked by:** 01 — Monorepo scaffold + Docker infra

**Status:** ready-for-agent

- [x] `@ecommerce/logger`: Pino factory that accepts service name, outputs structured JSON, includes request-id in logs
- [x] `@ecommerce/auth`: `signAccessToken`, `signRefreshToken`, `verifyAccessToken` functions with typed payloads
- [x] `@ecommerce/auth`: Fastify plugin that decodes JWT from Authorization header and decorates request with `{ userId, email, role }`
- [x] `@ecommerce/events`: Zod schemas for `user.registered`, `order.placed`, `payment.confirmed`, `payment.failed`, `order.status-changed`
- [x] `@ecommerce/events`: Topic name constants exported as a typed enum/object
- [x] `@ecommerce/events`: KafkaJS producer helper that serializes events through Zod schemas before publishing
- [x] `@ecommerce/events`: KafkaJS consumer helper that validates incoming messages through Zod schemas
- [x] All packages compile with `tsc` and export correct type declarations
- [x] Packages are importable from a service workspace via `@ecommerce/<name>`

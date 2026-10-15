# Scalable E-Commerce Platform

> **Status: Work in Progress** — project scaffold is in place, implementation is underway.

A fully containerized e-commerce platform built with microservices architecture. Designed as a hands-on learning project for distributed systems patterns: service decomposition, async event-driven communication (Kafka), centralized JWT auth, and containerized deployment.

Based on the [roadmap.sh Scalable E-Commerce Platform](https://roadmap.sh/projects/scalable-ecommerce-platform) challenge.

## Architecture

```
                    ┌─────────────────┐
                    │   API Gateway   │ :3000
                    │ rate limit · jwt│
                    └────────┬────────┘
                             │ REST
        ┌────────────────────┼────────────────────┐
        │                    │                     │
  ┌─────┴─────┐  ┌──────────┴────────┐  ┌────────┴───────┐
  │   user    │  │    product        │  │     cart       │
  │   :3001   │  │    :3002          │  │     :3003      │
  └───────────┘  └───────────────────┘  └────────────────┘
  ┌───────────┐  ┌───────────────────┐  ┌────────────────┐
  │   order   │  │    payment        │  │  notification  │
  │   :3004   │  │    :3005          │  │     :3006      │
  └─────┬─────┘  └────────┬──────────┘  └───────┬────────┘
        │                  │                     │
        └──────────────────┴─────────────────────┘
                           │
                     Apache Kafka
                   (async events)
```

## Tech Stack

- **Runtime**: Node.js 22 · TypeScript · ESM
- **Framework**: Fastify
- **ORM**: Drizzle
- **Messaging**: Kafka (KRaft mode)
- **Storage**: PostgreSQL 16 · Redis 7
- **Testing**: Vitest
- **Monorepo**: pnpm workspaces

## Project Structure

```
services/
  api-gateway/          → HTTP proxy, rate limiting, JWT validation
  user-service/         → Registration, auth, profile management
  product-service/      → Product catalog and categories
  cart-service/         → Shopping cart (Redis-backed)
  order-service/        → Order placement and lifecycle
  payment-service/      → Stripe integration (test mode)
  notification-service/ → Email (Mailpit in dev) and event-driven alerts

packages/
  auth/                 → JWT utilities and Fastify auth plugin
  events/               → Kafka event schemas (Zod) and helpers
  logger/               → Pino logger with request-id correlation
```

## Quickstart

### Prerequisites

- Docker with Compose v2
- A [Stripe test mode](https://dashboard.stripe.com/test/apikeys) secret key (`sk_test_...`): payments are processed against Stripe
- Node.js 22 and pnpm 11 (for `pnpm dev:docker`, tests and lint)

### Run the whole platform

```bash
cp .env.example .env   # then set STRIPE_SECRET_KEY
docker compose up --build
```

This starts Postgres, Redis, Kafka, Mailpit and the seven services, creates the Kafka topics, and seeds an admin user (`admin@example.com` / `ADMIN_PASSWORD`) and sample products. The platform is ready when `api-gateway` is healthy.

| URL                          | What                                   |
| ---------------------------- | -------------------------------------- |
| http://localhost:3000/api    | API Gateway (the only public API port) |
| http://localhost:3000/health | Gateway liveness                       |
| http://localhost:8025        | Mailpit: emails sent by the platform   |

Shopper journey through the gateway: `POST /api/auth/register` → `POST /api/auth/login` → `GET /api/products` → `POST /api/cart/items` → `POST /api/orders` → the order becomes `paid` once Stripe confirms → `GET /api/payments/order/:orderId`, with welcome, order and payment emails in Mailpit.

### Develop

`pnpm dev:docker` (stop with `pnpm dev:docker:down`) runs the platform with hot reload: each service runs `tsx watch` with its `src/` mounted, and ports 3001–3006 are exposed for debugging. Changes to `packages/*` or dependencies need a rebuild (`pnpm dev:docker` builds on start).

Tests run on the host against the infrastructure containers: `pnpm install && pnpm build`, then `pnpm test`.

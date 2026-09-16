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
  payment-service/      → Stripe integration (+ mock mode)
  notification-service/ → Email (Ethereal) and event-driven alerts

packages/
  auth/                 → JWT utilities and Fastify auth plugin
  events/               → Kafka event schemas (Zod) and helpers
  logger/               → Pino logger with request-id correlation
```

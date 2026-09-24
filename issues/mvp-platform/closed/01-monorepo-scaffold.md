# 01 — Monorepo scaffold + Docker infra

**What to build:** A working monorepo foundation where `pnpm install` resolves all workspaces and `docker compose up` boots PostgreSQL (separate instances for user, product, order, payment services), Redis, Kafka + Zookeeper. A developer clones the repo and has infrastructure running in one command. The workspace structure (`services/`, `packages/`) is in place with placeholder `package.json` files so future tickets can drop services in without restructuring.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] `pnpm-workspace.yaml` defines `services/*` and `packages/*` workspaces
- [x] Root `package.json` with shared dev scripts (`dev`, `build`, `lint`)
- [x] `tsconfig.base.json` with shared compiler options (strict, ESM, path aliases)
- [x] `.gitignore` covers `node_modules`, `dist`, `.env`, Docker volumes
- [x] `docker-compose.yml` defines: 1 Postgres container (with init script creating 4 databases), 1 Redis, Kafka (KRaft mode, no Zookeeper)
- [x] Postgres init script creates user_db, product_db, order_db, payment_db databases
- [x] `docker compose up` starts all infra services and they pass health checks
- [x] `.env.example` documents all required environment variables
- [x] Placeholder `package.json` exists in each `services/` and `packages/` directory

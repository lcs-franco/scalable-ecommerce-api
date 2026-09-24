# 10 — End-to-end wiring + Dockerfiles

**What to build:** Every service gets a multi-stage Dockerfile (node:22-alpine) and the full platform boots with a single `docker compose up`. The complete shopper journey works end-to-end through the gateway: register → login → browse products → add to cart → place order → payment processes automatically → notification emails appear in Ethereal. A `docker-compose.dev.yml` override enables hot reload with volume mounts for local development.

**Blocked by:** 09 — API Gateway; 08 — Notification Service

**Status:** ready-for-agent

- [ ] Multi-stage Dockerfile for each service: stage 1 installs deps + builds TS, stage 2 copies dist + prod deps only (node:22-alpine)
- [ ] All services added to `docker-compose.yml` with correct depends_on and health checks
- [ ] `docker compose up` boots the entire platform (infra + all 7 services)
- [ ] `docker-compose.dev.yml` override with volume mounts and `tsx watch` for hot reload
- [ ] End-to-end flow verified: register → login → browse → add to cart → place order → payment → notification
- [ ] Services wait for their dependencies (DB, Kafka, Redis) before accepting requests
- [ ] Container images are reasonably sized (< 150MB each)
- [ ] All environment variables documented in `.env.example` and wired through compose
- [ ] `README.md` with quickstart instructions: prerequisites, setup, and how to run

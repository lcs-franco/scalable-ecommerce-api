# 09 — API Gateway: routing, JWT validation, rate limiting

**What to build:** A single entry point on port 3000 that proxies all client requests to the correct upstream service. It validates JWTs on protected routes, rejects unauthenticated access with 401, enforces admin-only routes with 403, and applies tiered rate limiting via Redis (30 req/min anonymous by IP, 100 req/min authenticated by userId). Public routes (register, login, product browsing) bypass JWT validation. Downstream services receive `X-User-Id`, `X-User-Role`, and `X-Request-Id` headers.

**Blocked by:** 03 — User Service; 04 — Product Service; 05 — Cart Service; 06 — Order Service; 07 — Payment Service

**Status:** ready-for-agent

- [ ] Fastify-based reverse proxy using `@fastify/reply-from` or `undici`
- [ ] Route table maps path prefixes to upstream service URLs (configurable in code)
- [ ] Path rewriting: `/api/products/123` → `http://product-service:3002/products/123`
- [ ] Public routes bypass JWT validation: register, login, refresh, `GET /products`, `GET /categories`
- [ ] Protected routes require valid JWT; returns 401 with clear error message if missing/invalid/expired
- [ ] Admin-only routes (product/category CUD, order status update) check role; returns 403 if not admin
- [ ] Rate limiting via Redis sliding window: anonymous = 30/min by IP, authenticated = 100/min by userId
- [ ] Rate limit response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [ ] Returns 429 with `Retry-After` header when limit exceeded
- [ ] Generates `X-Request-Id` (UUID) and forwards to upstream along with `X-User-Id` and `X-User-Role`
- [ ] Response streaming (no buffering)

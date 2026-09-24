# 11 — Auth package: fix @fastify/jwt type augmentation for consumers

**What to fix:** The `@ecommerce/auth` package declares a module augmentation (`declare module '@fastify/jwt'`) in its source, but consumers that don't directly use `app.jwt` (e.g. product-service) never pull `@fastify/jwt` types into the compilation graph. The augmentation becomes orphaned and `request.user` loses its type.

Currently product-service works around this with an explicit `import '@fastify/jwt'` in app.ts. User-service works by accident because `auth.service.ts` uses `app.jwt.sign()`.

**Blocked by:** none

**Status:** done

- [x] Ensure `@ecommerce/auth`'s published types automatically bring `@fastify/jwt` types into any consumer's compilation graph
- [x] Remove the `import '@fastify/jwt'` workaround from product-service/src/app.ts
- [x] Verify both user-service and product-service pass `tsc --noEmit` from their own directories without explicit `@fastify/jwt` imports

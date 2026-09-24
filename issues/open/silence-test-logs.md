# Silence fastify request logs during test runs

**What to fix:** `pnpm test` outputs all Fastify request/response logs (pino INFO level), making test output noisy and hard to read. `buildApp` always initializes Fastify with `getLoggerConfig()` — there's no way to override logger settings for tests.

**Blocked by:** none

**Status:** todo

- [ ] Accept an optional logger override in `IBuildAppOptions`
- [ ] Pass `logger: false` from `createTestApp()` in test helpers
- [ ] Verify test output is clean across all services

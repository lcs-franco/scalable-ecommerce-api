# Separate HttpError from ApplicationError in error handler

**What to fix:** `Forbidden` and `Unauthorized` inherit from `ApplicationError`, but they are HTTP errors (401/403), not domain errors. The error handler in `app.ts` has a generic `statusCode < 500` branch that masks this distinction. Unexpected Fastify errors (404 from routing, invalid content-type) should become 500.

**Blocked by:** none

**Status:** todo

- [ ] Create `HttpError` base class separate from `ApplicationError`
- [ ] Move `Forbidden` and `Unauthorized` to inherit from `HttpError`
- [ ] Update error handler: ZodError → 400, ApplicationError → statusCode, HttpError → statusCode, fallback → 500
- [ ] Remove the `statusCode < 500` branch

# Extract shared error handler across services

**What to build:** A shared `registerErrorHandler(app)` function in a `@ecommerce/http` package (or added to `@ecommerce/auth`) that replaces the duplicated `setErrorHandler` block across services. The handler in `order-service/src/app.ts` is a verbatim copy of `product-service/src/app.ts` (ZodError → 400, ApplicationError → statusCode, fallback → 500). Consider combining with the HttpError/ApplicationError separation (`refactor-error-handler-hierarchy.md`).

**Blocked by:** none

**Status:** todo

- [ ] Create shared package or module exporting `registerErrorHandler`
- [ ] Update product-service to use the shared handler
- [ ] Update order-service to use the shared handler
- [ ] Remove duplicated `setErrorHandler` blocks from both services

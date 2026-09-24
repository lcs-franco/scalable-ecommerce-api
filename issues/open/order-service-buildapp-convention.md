# order-service: buildApp should return only `app`

**What to fix:** All other services return only `app` from `buildApp`. The order-service returns `{ app, orderService }`, leaking the service object to make it accessible in tests. This breaks the monorepo convention. Tests should access the service through HTTP like other services do.

**Blocked by:** none

**Status:** todo

- [ ] Register `orderService` as a Fastify decorator or access it through a plugin
- [ ] Update tests to access the service through HTTP
- [ ] Change `buildApp` to return only `app`

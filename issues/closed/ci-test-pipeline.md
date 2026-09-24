# 12 — Add test execution to CI pipeline

**What to build:** Add a CI step (GitHub Actions or equivalent) that runs `pnpm test` across all services after lint and typecheck pass. Each service needs its own Postgres database available during CI, matching the docker-compose setup (user_db, product_db, etc.).

**Blocked by:** none

**Status:** done

- [x] CI workflow runs `pnpm test` for all services with database access
- [x] Each service gets its own test database (matching docker-compose init script)
- [x] Tests run after lint and typecheck steps
- [x] CI fails if any test fails

# Coding Standards

Mechanical rules belong to lint (`pnpm lint`); this file holds only the judgement calls no linter can check.

## Naming and comments

- Comment only a "why" the code cannot say (an external quirk, a constraint from elsewhere), in one short line; never restate the name.
- When a comment feels needed to explain _what_ something is, rename it instead.

## Service structure

- Follow the `buildApp(deps)` / `index.ts` wiring pattern ([CLAUDE.md](CLAUDE.md#key-patterns)).
- Inject stateful dependencies (logger, db, clients, processors) through `buildApp(deps)`; never reach them through module-level singletons.

## Errors

- Model domain errors as subclasses of `ApplicationError` with a `code` from the service's own `ErrorCode` ([CLAUDE.md](CLAUDE.md#key-patterns)); the gateway uses `HttpError`.
- Do not throw a bare `Error` from routes or `src/services/`.

## Events

- Emit events with `enqueue(tx, …)` in the same transaction as the state change ([CLAUDE.md](CLAUDE.md#communication-patterns)).
- Never publish to Kafka from a request.

## Tests

- Test against real Postgres/Redis through `createTestApp()` ([CLAUDE.md](CLAUDE.md#testing)); never mock the database, fake only external providers (Stripe, SMTP).
- Assert emitted events as rows in the service's `outbox` table.

## Gateway

- Add every new client-facing route to the gateway allowlist in `services/api-gateway/src/routes/table.ts` ([CLAUDE.md](CLAUDE.md#communication-patterns)).

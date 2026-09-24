# 03 — User Service: register, login, refresh, profile

**What to build:** A shopper can register with email/password, log in and receive JWT access + refresh tokens, refresh an expired access token, log out (invalidating the refresh token), and view/update their profile. On registration, a `user.registered` event is published to Kafka. The service runs on port 3001 with its own Postgres database and Drizzle migrations.

**Blocked by:** 02 — Shared packages: logger, auth, events

**Status:** ready-for-agent

- [x] Drizzle schema for `users` table (id, email, password_hash, name, role, timestamps) and `refresh_tokens` table (id, user_id, token hash, expires_at)
- [x] Migrations run automatically on service startup
- [x] `POST /register` — creates user with bcrypt-hashed password, returns user data (no password), publishes `user.registered` to Kafka
- [x] `POST /login` — validates credentials, returns `{ accessToken, refreshToken }`
- [x] `POST /refresh` — accepts refresh token in body, validates against DB, returns new access token
- [x] `POST /logout` — requires auth, deletes refresh token from DB
- [x] `GET /profile` — requires auth, returns current user's profile
- [x] `PATCH /profile` — requires auth, updates name and/or password
- [x] Email uniqueness enforced at DB level, returns 409 on duplicate
- [x] Zod request validation on all endpoints
- [x] A dev seed script creates an admin user for testing

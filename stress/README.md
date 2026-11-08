# Stress world

A separate compose project (`ecommerce-stress`) with a deliberately absurd dataset, so the stress campaign sees what breaks under real data volume. Decisions live in issue #72.

It runs alongside `pnpm dev`: own volumes, host ports shifted by `stress.env` (gateway 4000, Postgres 6432, Redis 7380, Kafka 10092, Mailpit 2025/9025, Grafana 4100, Prometheus 10090). Secrets come from the root `.env`.

## Usage

```bash
# Seed at full scale (a smoke world: SEED_SCALE=0.001)
SEED_SCALE=1 docker compose -f stress/compose.yaml up -d --build
docker wait ecommerce-stress-stress-seed-1   # prints the seed's exit code
docker compose -f stress/compose.yaml logs stress-seed

# Verify invariants (same SEED_* env as the seed)
SEED_SCALE=1 stress/scripts/check.sh

# Snapshot after seeding, restore before each experiment (name defaults to "seed")
stress/scripts/snapshot.sh
stress/scripts/restore.sh

# Put the hot product back to HOT_STOCK units
docker compose -f stress/compose.yaml exec -T postgres \
  psql -U ecommerce -d product_db -v hot_stock=100 -f - < stress/seed/reset-hot.sql

# Metrics: Grafana at http://localhost:4100, Prometheus at http://localhost:10090
docker compose -f stress/compose.yaml --profile observability up -d

# Stop (keeps the data); rebuild from scratch with down -v, then up
docker compose -f stress/compose.yaml --profile observability down
```

`up --wait` reports failure because `cart-seed` exits on its own; wait on the seed container instead. The seed runs on every `up` but each database script skips itself once its marker row exists. Snapshot volumes (`ecommerce-stress_postgres-snapshot-<name>`, ~37 GB each at full scale) are not part of the compose file, so `down -v` keeps them; remove them with `docker volume rm`. A restore resets Postgres only: re-seed the carts with `docker compose -f stress/compose.yaml up cart-seed`.

## Attacks (k6 harness)

Every traffic-based attack runs a scenario from `scenarios/` through `scripts/attack.sh`. Decisions live in issue #73.

```bash
# The stress world must be up (see Usage); SEED_* must match the seed, as for check.sh
SEED_SCALE=1 stress/scripts/attack.sh smoke

# Extra arguments go to `k6 run`
SEED_SCALE=1 stress/scripts/attack.sh smoke --quiet --no-color

# Only the invariants, for a run started at <timestamp> with the hot product at <stock>
stress/scripts/verify.sh --since '<timestamp>' --hot-initial <stock>
```

`attack.sh` records the run start (Postgres clock) and the hot product's stock, runs k6 from its official image (service `k6`, profile `k6`, no resource limits), then `verify.sh`. It exits non-zero if k6 failed (a threshold crossed: errors or latency) or an invariant does not hold, so either verdict means the platform broke. k6 pushes its metrics to Prometheus (remote write, k6 row in the Grafana dashboard) only when the `prometheus` container is running.

`verify.sh` polls until the run settles (no pending run order, no unpublished outbox event, no `stock_restorations` row) or `VERIFY_TIMEOUT` passes, then `checks/after-run.sql` asserts, over orders created since the run start:

- no product has negative stock;
- hot product: initial stock − quantity sold in non-cancelled run orders = final stock;
- every run order is `paid` or `cancelled`;
- no unpublished event in the user, order or payment outbox, and `stock_restorations` is empty.

At full scale `verify.sh` takes ~10 s (it scans `products`, `orders` and `order_items`, which have no index for it).

### Scenarios

A scenario is a file in `scenarios/` that declares its executors (always open model: `constant-arrival-rate` or `ramping-arrival-rate`, so overload shows up as latency and errors), its thresholds and `handleSummary`. It sends every request through `lib/http.ts`, which tags `name` with the route template (`/api/products/:id`).

| Scenario | Traffic                                                                                       |
| -------- | --------------------------------------------------------------------------------------------- |
| `smoke`  | 1 iteration/s for 1 min: list products, open one, add it to the cart, check out (Stripe test) |

`lib/`:

- `auth.ts`: `loginUsers()` logs in `K6_USERS` users from user 111 in `setup()` (whales 0–9 and seeded carts 10–110 stay out); `vuSession()` gives each VU its own user, so a scenario's `maxVUs` must not exceed `K6_USERS`. Tokens last 15 minutes and are not refreshed.
- `world.ts`: world size from `SEED_*`, ids as in `seed/common.sql`, `pickProduct()` with the seed's popularity, the hot product excluded unless `{ includeHot: true }`.
- `thresholds.ts`: per-route p95/p99 plus error-rate thresholds and the defaults.
- `summary.ts`: prints the summary and writes `results/<scenario>-<timestamp>.json` (gitignored).

### Knobs

| Env                                           | Default   | Effect                                                                  |
| --------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| `SEED_SCALE` / `SEED_PRODUCTS` / `SEED_USERS` | as seeded | World size k6 derives ids from                                          |
| `K6_USERS`                                    | `200`     | Users logged in by `setup()`                                            |
| `VERIFY_TIMEOUT`                              | `60`      | Seconds `verify.sh` waits for the run to settle                         |
| `RATE_LIMIT_ANONYMOUS` / `_AUTHENTICATED`     | `1000000` | Gateway limits per minute (`stress.env`); the limiter stays in the path |

### When to restore

An attack leaves its orders, payments and stock changes behind, and the invariants only look at the run's own orders, so runs can follow each other. Restore (`scripts/restore.sh`, then `up cart-seed`) before an attack whose hypothesis depends on the seeded state: the hot product's stock (or reset only it with `seed/reset-hot.sql`), a user's order count, or popular products running out of stock after many runs. `scripts/check.sh` checks the seed, so it fails after any attack until a restore.

### Smoke world

`SEED_SCALE=0.001` in its own compose project seeds in about a minute and keeps the full-scale volumes untouched (stop the full world first, the host ports are the same):

```bash
export COMPOSE_PROJECT_NAME=ecommerce-stress-smoke SEED_SCALE=0.001
docker compose -f stress/compose.yaml up -d && docker wait ecommerce-stress-smoke-stress-seed-1
stress/scripts/attack.sh smoke
docker compose -f stress/compose.yaml down -v
```

## Seed knobs

| Env                                            | Default    | Effect                                   |
| ---------------------------------------------- | ---------- | ---------------------------------------- |
| `SEED_SCALE`                                   | `1`        | Multiplies every volume below            |
| `SEED_PRODUCTS` / `SEED_USERS` / `SEED_ORDERS` | scaled     | Override one volume                      |
| `SEED_SALT`                                    | `20261030` | Seed of the hash-based pseudo-randomness |
| `HOT_STOCK`                                    | `100`      | Stock of the hot product                 |

At `SEED_SCALE=1`: 5M products, 2M users, 20M orders (~60M items), 20M payments, 1,000 categories plus the monster one, 10 whales with 50k orders each. Floors keep the special cases at any scale (≥ 1,001 products, ≥ 111 users, ≥ 10 categories); whales keep at most 2.5% of the orders when `SEED_ORDERS` is small. Below full scale product 0 takes a larger share of the items (`N^-0.25`, ~12% at 5k products), so repeats collapse and the item mean drops under 3.

## Deriving ids (for k6)

Everything derives from an integer index, as in `seed/common.sql`:

- ids: `md5('<kind>:<n>')` as a uuid, kinds `user`, `product`, `category`, `order`, `order-item` (`n = order * 8 + line`), `payment`; the stress admin is `admin:0`
- users: `user<n>@stress.local`, password `stress-password`; `admin@stress.local` (role admin, same password)
- whales: users 0–9 own orders `0 … 10 × whale_orders − 1`
- hot product: product 0 (`md5('product:0')`), normal category, stock `HOT_STOCK`
- monster category: category 0 (`Category 0`, ~40% of products)
- carts (Redis, re-seeded on every `up`): user 10 has 1,000 items, users 11–110 have 1–5; product 0 is never in a cart
- descriptions: 2–8 KB from a 500-word list (`stress.word(i)`); `word(0)` = `kakaka` is in every description, high indices are rare

## Full-run results

Machine: 12 cores, 14 GB RAM, Docker on a local SSD. Postgres runs with its defaults except `max_wal_size=16GB`.

`SEED_SCALE=1`, run on 2026-10-30, the four database scripts in parallel:

| Database     | Seed duration | On disk | Largest relations (total / heap / indexes)                                |
| ------------ | ------------- | ------- | ------------------------------------------------------------------------- |
| `user_db`    | ~45 s         | 473 MB  | `users` 465 MB / 319 MB / 146 MB                                          |
| `product_db` | 1,472 s       | 11 GB   | `products` 11 GB / 3.8 GB / 150 MB (the rest is TOASTed descriptions)     |
| `order_db`   | 1,796 s       | 10 GB   | `order_items` 7.7 GB / 5.8 GB / 1.8 GB; `orders` 2.7 GB / 2.1 GB / 0.6 GB |
| `payment_db` | ~1,548 s      | 4.6 GB  | `payments` 4.6 GB / 3.4 GB / 1.2 GB                                       |

- Wall time from `up` to the seed's exit: 1,831 s (~31 min); `order_db` is the critical path. Each script is one single-threaded `INSERT … SELECT` stream, so Postgres sat at ~280–400% CPU on 12 cores.
- Postgres volume: 36.5 GB. Host disk peaked 36 GB above the start. Postgres used at most 1.3 GB of RAM (the rest is page cache); host available memory never dropped below 5.4 GB.
- Snapshot: 174 s. Restore: 164 s (file-level copy of the 36.5 GB volume, Postgres stopped).
- `scripts/check.sh` at full scale: all invariants hold, 539 s.

### Findings

- **Docker's 64 MB `/dev/shm` breaks parallel maintenance.** The final `VACUUM (ANALYZE)` of `user_db` and `payment_db` failed with `could not resize shared memory segment … No space left on device` (payment asked for 760 MB with `maintenance_work_mem=1GB`). The data had already committed and autovacuum had processed the tables (a manual pass took 2 s), but the seed exited 1. The scripts now run `VACUUM (ANALYZE, PARALLEL 0)`. The stress Postgres keeps the default `shm_size` on purpose: parallel queries at runtime draw from the same 64 MB, which the campaign should look at.
- The machine took the full scale: no OOM, no swap growth that mattered, 165 GB of disk left.

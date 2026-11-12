# Stress world

A separate compose project (`ecommerce-stress`) with a deliberately absurd dataset, so the stress campaign sees what breaks under real data volume. Decisions live in issue #72.

It runs alongside `pnpm dev`: own volumes, host ports shifted by `stress.env` (gateway 4000, Postgres 6432, Redis 7380, Kafka 10092, Mailpit 2025/9025, Grafana 4100, Prometheus 10090, Toxiproxy API 9474). Every container runs under [limits](#limits-and-faults). Secrets come from the root `.env`.

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

`attack.sh` records the run start (Postgres clock) and the hot product's stock, removes every toxic, runs k6 from its official image (service `k6`, profile `k6`, no resource limits), then `verify.sh`, then lists the `die`/`oom` Docker events of the stack's containers during the run. It exits non-zero if k6 failed (a threshold crossed: errors or latency), an invariant does not hold or a container died (services restart on failure, so a crash would otherwise show only as a few errors); any of these means the platform broke. k6 pushes its metrics to Prometheus (remote write, k6 row in the Grafana dashboard) only when the `prometheus` container is running.

`verify.sh` polls until the run settles (no pending run order, no unpublished outbox event, no `stock_restorations` row) or `VERIFY_TIMEOUT` passes, then `checks/after-run.sql` asserts, over orders created since the run start:

- no product has negative stock;
- hot product: initial stock − quantity sold in non-cancelled run orders = final stock;
- every run order is `paid` or `cancelled`;
- no unpublished event in the user, order or payment outbox, and `stock_restorations` is empty.

At full scale `verify.sh` takes ~10 s (it scans `products`, `orders` and `order_items`, which have no index for it).

### Scenarios

A scenario is a file in `scenarios/` that declares its executors (always open model: `constant-arrival-rate` or `ramping-arrival-rate`, so overload shows up as latency and errors), its thresholds and `handleSummary`. It sends every request through `lib/http.ts`, which tags `name` with the route template (`/api/products/:id`).

| Scenario    | Traffic                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `smoke`     | 1 iteration/s for 1 min: list products, open one, add it to the cart, check out (fake processor)                    |
| `calibrate` | The smoke journey ramping from 1 to `CALIBRATE_MAX_RATE` iterations/s over 5 min, to find where the limits saturate |

`lib/`:

- `auth.ts`: `loginUsers()` logs in `K6_USERS` users from user 111 in `setup()` (whales 0–9 and seeded carts 10–110 stay out); `vuSession()` gives each VU its own user, so a scenario's `maxVUs` must not exceed `K6_USERS`. Tokens last 15 minutes and are not refreshed.
- `world.ts`: world size from `SEED_*`, ids as in `seed/common.sql`, `pickProduct()` with the seed's popularity, the hot product excluded unless `{ includeHot: true }`.
- `thresholds.ts`: per-route p95/p99 plus error-rate thresholds and the defaults.
- `summary.ts`: prints the summary and writes `results/<scenario>-<timestamp>.json` (gitignored).
- `toxics.ts`: `addToxic()`, `removeToxic()`, `setProxyEnabled()` and `clearFaults()` against the Toxiproxy API, for the [faults](#faults) a scenario injects.

### Knobs

| Env                                           | Default       | Effect                                                                         |
| --------------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| `SEED_SCALE` / `SEED_PRODUCTS` / `SEED_USERS` | as seeded     | World size k6 derives ids from                                                 |
| `K6_USERS`                                    | `200`         | Users logged in by `setup()`                                                   |
| `CALIBRATE_MAX_RATE`                          | `100`         | Final rate of `calibrate` (pass it as `-e CALIBRATE_MAX_RATE=…`)               |
| `VERIFY_TIMEOUT`                              | `60`          | Seconds `verify.sh` waits for the run to settle                                |
| `RATE_LIMIT_ANONYMOUS` / `_AUTHENTICATED`     | `1000000`     | Gateway limits per minute (`stress.env`); the limiter stays in the path        |
| `PAYMENT_PROCESSOR`                           | `fake`        | Payment processor (`stress.env`); `stripe` sends checkouts to Stripe test mode |
| `FAKE_PAYMENT_LATENCY_MS` / `_JITTER_MS`      | `200` / `100` | Fake processor delay: latency plus a uniform random share of the jitter        |
| `FAKE_PAYMENT_FAILURE_RATE`                   | `0`           | Share of orders the fake processor declines (0–1), decided per order           |

The fake processor's outcome is a hash of the order's idempotency key, so a redelivered `order.placed` gets the same answer, and `pm_card_chargeDeclined` always declines, so a scenario can pick failures from the request body. Payments it handles have `provider = 'fake'`. To simulate a slow PSP, override a knob and recreate the service:

```bash
FAKE_PAYMENT_LATENCY_MS=3000 docker compose -f stress/compose.yaml up -d payment-service
```

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

## Limits and faults

Decisions live in issue #74.

### Limits

Every container of the stress world has a CPU and memory ceiling, so the platform saturates at a load one laptop generates, and the same load gives the same result on another machine. They are part of every result: a number quoted without them means nothing. Services set them in `services.override.yaml`, infrastructure in `infra.override.yaml`, observability in `docker/observability.yaml`; k6 has none.

| Container                                                       | `cpus`     | `mem_limit`      | Note                                           |
| --------------------------------------------------------------- | ---------- | ---------------- | ---------------------------------------------- |
| `api-gateway`                                                   | 1          | 256m             | every request crosses it                       |
| each other service                                              | 0.5        | 256m             | Node sizes its heap from the cgroup limit      |
| `postgres`                                                      | 2          | 2g               | the page cache counts against the limit        |
| `kafka`                                                         | 1          | 1g               | heap pinned to 512 MB (`KAFKA_HEAP_OPTS`)      |
| `redis`                                                         | 0.5        | 128m             |                                                |
| `toxiproxy`                                                     | 1          | 128m             | in the path of every proxied call              |
| seeds (`user-seed`, `product-seed`, `stress-seed`, `cart-seed`) | 0.5        | 256m (cart 128m) | clients only: the seed's work runs in Postgres |
| `mailpit` / `kafka-init`                                        | 0.25 / 0.5 | 128m / 512m      |                                                |

**Calibration** (2026-11-11, smoke world, `attack.sh calibrate -e CALIBRATE_MAX_RATE=200`): the journey holds p95 ≈ 5 ms up to ~55 iterations/s (~220 req/s); at ~65 iterations/s `product-service` sits at its 0.5 CPU (throttled in 99% of CFS periods), throughput stops growing and p95 jumps to ~1 s. k6 used 0.16 of a core. The rule: the platform must saturate at a rate k6 generates with room to spare; if a change of machine or code moves the knee past what k6 can push, lower the limits, not the other way around.

Side effects of the limits worth knowing before reading a result:

- `setup()` logs users in at ~2 per second (bcrypt, 12 rounds, on 0.5 CPU), so 200 users take ~2 minutes; scenarios allow 5.
- At full scale `GET /api/products` sorts all of `products` by `created_at` (no index): a 3.8 GB sequential scan that no longer fits the 2 GB page cache, ~3 s per call, so the smoke journey breaks below 1 iteration/s there. That is the data-volume attack's (#75) to diagnose; calibrate in the smoke world.
- The payment consumer settles ~5 orders per second (one partition, one fake processor call of 200 ms + jitter at a time) with almost no CPU: any checkout rate above that leaves orders `pending` and `verify.sh` reports them. That is the dependency attack's (#77) slow-PSP hypothesis.

### Faults

Toxiproxy (`toxiproxy.yaml`, API on host port 9474) sits on the paths the attacks target. Traffic always goes through it, even with no toxic, so a baseline and a fault run share one topology. Seeds talk to Postgres directly.

| Proxy (`toxiproxy.json`) | Listens on        | Upstream               | Client                                              |
| ------------------------ | ----------------- | ---------------------- | --------------------------------------------------- |
| `order-product`          | `toxiproxy:13002` | `product-service:3002` | `order-service`                                     |
| `order-cart`             | `toxiproxy:13003` | `cart-service:3003`    | `order-service`                                     |
| `user-postgres`          | `toxiproxy:15431` | `postgres:5432`        | `user-service`                                      |
| `product-postgres`       | `toxiproxy:15432` | `postgres:5432`        | `product-service`                                   |
| `order-postgres`         | `toxiproxy:15433` | `postgres:5432`        | `order-service`                                     |
| `payment-postgres`       | `toxiproxy:15434` | `postgres:5432`        | `payment-service`                                   |
| `kafka`                  | `toxiproxy:19092` | `kafka:29094`          | `user`, `order`, `payment`, `notification` services |

Kafka clients only bootstrap through the address they are given, then connect to the address the broker advertises, so the broker has a `TOXIPROXY` listener (`kafka:29094`) advertised as `toxiproxy:19092`; `kafka:29092` stays for `kafka-init` and the host. Redis and a dead service are faults for `docker pause` / `docker kill`, not Toxiproxy.

A scenario injects faults with `lib/toxics.ts`, typically from a second executor that starts after the baseline:

```ts
addToxic('order-product', {
  name: 'slow',
  type: 'latency',
  attributes: { latency: 1500 },
})
setProxyEnabled('order-product', false) // the dependency is down: connections refused
clearFaults() // every toxic removed, every proxy enabled
```

With a 1,500 ms latency toxic on `order-product`, a checkout went from 26 ms to 1,519 ms; with the proxy disabled it failed with 500 in 8 ms. By hand: `curl -X POST localhost:9474/reset`, `curl localhost:9474/proxies`.

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

`SEED_SCALE=1`, run on 2026-10-30, the four database scripts in parallel, before the [limits](#limits-and-faults) existed (Postgres now has 2 CPUs, so a reseed will take longer; re-time it then):

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

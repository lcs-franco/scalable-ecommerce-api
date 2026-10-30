# Stress world

A separate compose project (`ecommerce-stress`) with a deliberately absurd dataset, so the stress campaign sees what breaks under real data volume. Decisions live in issue #72.

It runs alongside `pnpm dev`: own volumes, host ports shifted by `ports.env` (gateway 4000, Postgres 6432, Redis 7380, Kafka 10092, Mailpit 2025/9025). Secrets come from the root `.env`.

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

# Stop (keeps the data); rebuild from scratch with down -v, then up
docker compose -f stress/compose.yaml down
```

`up --wait` reports failure because `cart-seed` exits on its own; wait on the seed container instead. The seed runs on every `up` but each database script skips itself once its marker row exists. Snapshot volumes (`ecommerce-stress_postgres-snapshot-<name>`, ~37 GB each at full scale) are not part of the compose file, so `down -v` keeps them; remove them with `docker volume rm`. A restore resets Postgres only: re-seed the carts with `docker compose -f stress/compose.yaml up cart-seed`.

## Knobs

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

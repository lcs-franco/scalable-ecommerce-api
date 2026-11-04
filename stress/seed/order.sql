\set ON_ERROR_STOP on

SET synchronous_commit = off;
SET maintenance_work_mem = '1GB';

BEGIN;

\ir common.sql

SELECT EXISTS (SELECT FROM orders WHERE id = stress.uuid('order', 0)) AS seeded \gset

\if :seeded
  \echo already seeded, skipping
  ROLLBACK;
  \quit
\endif

CALL stress.drop_constraints('{orders,order_items}');

-- chunked so each batch of items is materialized once and summed into its orders
DO $$
DECLARE
  chunk constant bigint := 250000;
  lo bigint := 0;
  hi bigint;
BEGIN
  WHILE lo < stress.orders() LOOP
    hi := least(lo + chunk, stress.orders());

    WITH items AS MATERIALIZED (
      SELECT o, i.line, i.product, i.quantity, stress.price(i.product) AS price
      FROM generate_series(lo, hi - 1) o
      CROSS JOIN LATERAL stress.order_items(o) i
    ), inserted AS (
      INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity)
      SELECT stress.uuid('order-item', o * 8 + line), stress.uuid('order', o), stress.uuid('product', product),
             'Product ' || product, price, quantity
      FROM items
    )
    INSERT INTO orders (id, user_id, user_email, status, total, created_at, updated_at)
    SELECT stress.uuid('order', o), stress.uuid('user', u), stress.email(u), stress.order_status(o)::order_status,
           total, created, created + stress.unit('order-updated', o) * interval '7 days'
    FROM (SELECT o, sum(price * quantity)::integer AS total FROM items GROUP BY o) t
    CROSS JOIN LATERAL (SELECT stress.order_user(o) AS u, stress.order_created_at(o) AS created) c;

    lo := hi;

    RAISE NOTICE 'orders % / %', lo, stress.orders();
  END LOOP;
END $$;

CALL stress.restore_constraints();

SET LOCAL client_min_messages = warning;
DROP SCHEMA stress CASCADE;

COMMIT;

-- parallel vacuum overflows Docker's 64 MB /dev/shm
VACUUM (ANALYZE, PARALLEL 0);

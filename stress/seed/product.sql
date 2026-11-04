\set ON_ERROR_STOP on

SET synchronous_commit = off;
SET maintenance_work_mem = '1GB';

BEGIN;

\ir common.sql

SELECT EXISTS (SELECT FROM products WHERE id = stress.uuid('product', 0)) AS seeded \gset

\if :seeded
  \echo already seeded, skipping
  ROLLBACK;
  \quit
\endif

-- category 0 is the monster category
INSERT INTO categories (id, name, created_at, updated_at)
SELECT stress.uuid('category', c), 'Category ' || c, stress.epoch() - interval '400 days', stress.epoch() - interval '400 days'
FROM generate_series(0, stress.categories()) c;

CALL stress.drop_constraints('{products}');

INSERT INTO products (id, name, description, price, stock, category_id, created_at, updated_at)
SELECT stress.uuid('product', p), 'Product ' || p, d.description, stress.price(p),
       CASE WHEN p = 0 THEN :hot_stock ELSE 10 + stress.hash('stock', p) % 990 END,
       stress.uuid('category', stress.product_category(p)), t, t
FROM generate_series(0, stress.products() - 1) p
CROSS JOIN LATERAL stress.description(p) d
CROSS JOIN LATERAL (SELECT stress.epoch() - stress.unit('product-created', p) * interval '365 days' AS t) c;

CALL stress.restore_constraints();

SET LOCAL client_min_messages = warning;
DROP SCHEMA stress CASCADE;

COMMIT;

-- parallel vacuum overflows Docker's 64 MB /dev/shm
VACUUM (ANALYZE, PARALLEL 0);

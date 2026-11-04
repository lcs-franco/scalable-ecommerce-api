-- Runs in order_db and reads the other databases through dblink
\set ON_ERROR_STOP on

BEGIN;

\ir ../seed/common.sql

CREATE EXTENSION dblink;

CREATE FUNCTION stress.hot_stock() RETURNS integer IMMUTABLE LANGUAGE sql RETURN :hot_stock;

SELECT format('user=%s dbname=', current_user) AS conn \gset

CREATE TEMP TABLE p AS
SELECT * FROM dblink(:'conn' || 'product_db', 'SELECT id, name, price, stock, category_id FROM products')
  AS t(id uuid, name text, price integer, stock integer, category_id uuid);

CREATE TEMP TABLE u AS
SELECT * FROM dblink(:'conn' || 'user_db', 'SELECT id, email, role::text FROM users') AS t(id uuid, email text, role text);

CREATE TEMP TABLE pay AS
SELECT * FROM dblink(:'conn' || 'payment_db', 'SELECT order_id, user_id, user_email, amount, status::text, provider, provider_payment_id, failure_reason FROM payments')
  AS t(order_id uuid, user_id uuid, user_email text, amount integer, status text, provider text,
       provider_payment_id text, failure_reason text);

CREATE TEMP TABLE schema_shape AS
SELECT db, shape
FROM unnest('{user_db,product_db,order_db,payment_db}'::text[]) db
CROSS JOIN LATERAL dblink(:'conn' || db, $q$
  SELECT string_agg(name, ',' ORDER BY name) FROM (
    SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'
    UNION SELECT conname FROM pg_constraint WHERE contype = 'f'
    UNION SELECT 'schema:' || nspname FROM pg_namespace WHERE nspname = 'stress'
  ) s
$q$) AS t(shape text);

CREATE TEMP TABLE leftovers AS
SELECT * FROM dblink(:'conn' || 'product_db', 'SELECT ''stock_restorations'', count(*) FROM stock_restorations')
  AS t(what text, n bigint)
UNION ALL
SELECT db || '.outbox', n
FROM unnest('{user_db,order_db,payment_db}'::text[]) db
CROSS JOIN LATERAL dblink(:'conn' || db, 'SELECT count(*) FROM outbox') AS t(n bigint);

DO $$
DECLARE
  r record;
BEGIN
  SELECT count(*) n INTO r FROM p WHERE name LIKE 'Product %';
  ASSERT r.n = stress.products(), format('products seeded: %s', r);

  SELECT count(*) n INTO r FROM u WHERE email LIKE '%@stress.local';
  ASSERT r.n = stress.users() + 1, format('users plus the stress admin: %s', r);

  ASSERT (SELECT role FROM u WHERE email = 'admin@stress.local') = 'admin', 'admin@stress.local is an admin';

  SELECT count(*) n INTO r FROM orders;
  ASSERT r.n = stress.orders(), format('orders seeded: %s', r);

  SELECT count(*) n INTO r FROM pay;
  ASSERT r.n = stress.orders(), format('one payment per order: %s', r);

  SELECT count(*) n INTO r FROM orders WHERE status = 'pending';
  ASSERT r.n = 0, 'no pending orders';

  SELECT avg((status = 'delivered')::int) delivered, avg((status = 'shipped')::int) shipped,
         avg((status = 'paid')::int) paid, avg((status = 'cancelled')::int) cancelled
  INTO r FROM orders;
  ASSERT abs(r.delivered - 0.70) < 0.02 AND abs(r.shipped - 0.08) < 0.02
     AND abs(r.paid - 0.04) < 0.02 AND abs(r.cancelled - 0.18) < 0.02, format('status mix: %s', r);

  SELECT count(*) n INTO r FROM orders o
  LEFT JOIN (SELECT order_id, sum(price * quantity) s FROM order_items GROUP BY order_id) i ON i.order_id = o.id
  WHERE i.s IS DISTINCT FROM o.total;
  ASSERT r.n = 0, format('orders whose total differs from their items: %s', r);

  SELECT count(*) n INTO r FROM orders o LEFT JOIN u ON u.id = o.user_id
  WHERE u.email IS DISTINCT FROM o.user_email;
  ASSERT r.n = 0, format('orders whose user_email does not match the user: %s', r);

  SELECT count(*) n INTO r FROM order_items i LEFT JOIN p ON p.id = i.product_id
  WHERE p.name IS DISTINCT FROM i.product_name OR p.price IS DISTINCT FROM i.price;
  ASSERT r.n = 0, format('order items whose snapshot does not match product_db: %s', r);

  SELECT count(*) n INTO r FROM orders o LEFT JOIN pay ON pay.order_id = o.id
  WHERE pay.amount IS DISTINCT FROM o.total OR pay.user_id IS DISTINCT FROM o.user_id
     OR pay.user_email IS DISTINCT FROM o.user_email;
  ASSERT r.n = 0, format('payments that do not match their order: %s', r);

  SELECT count(*) n INTO r FROM orders o JOIN pay ON pay.order_id = o.id
  WHERE NOT CASE pay.status
    WHEN 'confirmed' THEN pay.failure_reason IS NULL AND pay.provider = 'stripe' AND pay.provider_payment_id LIKE 'pi\_%'
    WHEN 'failed' THEN o.status = 'cancelled' AND pay.failure_reason IS NOT NULL
    ELSE false
  END;
  ASSERT r.n = 0, format('payments inconsistent with their order status: %s', r);

  SELECT avg((pay.status = 'failed')::int) failed INTO r
  FROM orders o JOIN pay ON pay.order_id = o.id WHERE o.status = 'cancelled';
  ASSERT abs(r.failed - 0.5) < 0.05, format('half the cancelled orders have a failed payment: %s', r);

  SELECT count(*) n, min(c) lo, max(c) hi INTO r
  FROM (SELECT user_id, count(*) c FROM orders WHERE user_id IN (SELECT stress.uuid('user', w) FROM generate_series(0, stress.whales() - 1) w) GROUP BY user_id) s;
  ASSERT stress.orders() < stress.whales() * stress.whale_orders()
      OR (r.n = stress.whales() AND r.lo = stress.whale_orders() AND r.hi = stress.whale_orders()),
    format('10 whales with %s orders each: %s', stress.whale_orders(), r);

  SELECT stock, category_id <> stress.uuid('category', 0) AS normal INTO r FROM p WHERE id = stress.uuid('product', 0);
  ASSERT r.stock = stress.hot_stock() AND r.normal, format('hot product in a normal category with stock %s: %s', stress.hot_stock(), r);

  SELECT avg((category_id = stress.uuid('category', 0))::int) monster INTO r FROM p WHERE name LIKE 'Product %';
  ASSERT abs(r.monster - 0.4) < 0.02, format('monster category holds ~40%% of products: %s', r);

  SELECT string_agg(what || '=' || n, ', ') bad INTO r FROM leftovers WHERE n <> 0;
  ASSERT r.bad IS NULL, format('stock_restorations and every outbox stay empty: %s', r.bad);

  SELECT string_agg(db, ', ') bad INTO r
  FROM schema_shape JOIN (VALUES
    ('user_db', 'outbox_pending_idx,outbox_pkey,refresh_tokens_pkey,refresh_tokens_token_unique,refresh_tokens_user_id_users_id_fk,users_email_unique,users_pkey'),
    ('product_db', 'categories_name_unique,categories_pkey,products_category_id_categories_id_fk,products_pkey,stock_restorations_pkey'),
    ('order_db', 'order_items_order_id_orders_id_fk,order_items_pkey,orders_pkey,outbox_pending_idx,outbox_pkey'),
    ('payment_db', 'outbox_pending_idx,outbox_pkey,payments_order_id_unique,payments_pkey')
  ) AS expected (db, shape) USING (db)
  WHERE schema_shape.shape IS DISTINCT FROM expected.shape;
  ASSERT r.bad IS NULL, format('indexes and FKs are exactly the migrations'' in: %s', r.bad);
END $$;

ROLLBACK;

\echo invariants ok

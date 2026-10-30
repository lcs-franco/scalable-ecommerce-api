\set ON_ERROR_STOP on
\set products 5000000
\set users 2000000
\set orders 20000000
\set categories 1000
\set whale_orders 50000

BEGIN;

\ir ../seed/common.sql

DO $$
DECLARE
  r record;
BEGIN
  ASSERT stress.uuid('product', 0) = 'c4de7a1c-737d-1760-42d6-fff41bdcc90f', 'uuid is md5(kind:n)';
  ASSERT stress.uuid('user', 0) = 'f5f1b8e8-a885-b8ad-01a7-17783f381411', 'user uuid';
  ASSERT stress.email(42) = 'user42@stress.local', 'email';

  SELECT avg(stress.unit('t', n)) avg, min(stress.unit('t', n)) lo, max(stress.unit('t', n)) hi
  INTO r FROM generate_series(1, 100000) n;
  ASSERT r.avg BETWEEN 0.49 AND 0.51 AND r.lo >= 0 AND r.hi < 1, format('unit is uniform in [0,1): %s', r);

  ASSERT stress.unit('a', 7) <> stress.unit('b', 7), 'streams are independent';

  SELECT min(stress.price(p)) lo, max(stress.price(p)) hi INTO r FROM generate_series(0, 99999) p;
  ASSERT r.lo >= 100 AND r.hi <= 99999, format('price in cents between 1.00 and 999.99: %s', r);

  SELECT avg((stress.product_category(p) = 0)::int) monster, count(DISTINCT stress.product_category(p)) n
  INTO r FROM generate_series(1, 100000) p;
  ASSERT r.monster BETWEEN 0.38 AND 0.42, format('monster category holds ~2M of 5M products: %s', r);
  ASSERT r.n = 1001, format('monster plus ~1000 categories: %s', r);
  ASSERT stress.product_category(0) <> 0, 'hot product is in a normal category';

  SELECT min(length(description)) lo, max(length(description)) hi
  INTO r FROM generate_series(0, 1999) p, stress.description(p);
  ASSERT r.lo >= 2048 AND r.hi <= 8192, format('descriptions are 2-8 KB: %s', r);

  SELECT count(DISTINCT w) n INTO r
  FROM (
    SELECT regexp_split_to_table(regexp_replace(description, ' \S*$', ''), ' ') w
    FROM generate_series(0, 1999) p, stress.description(p)
  ) s;
  ASSERT r.n BETWEEN 400 AND 500, format('descriptions draw from a ~500-word list: %s', r);

  SELECT count(*) FILTER (WHERE position(stress.word(0) IN description) > 0) common,
         count(*) FILTER (WHERE position(stress.word(499) IN description) > 0) rare
  INTO r FROM generate_series(0, 999) p, stress.description(p);
  ASSERT r.common = 1000 AND r.rare < 300, format('word 0 is common, word 499 rare: %s', r);

  SELECT sum(c)::float8 / 20000 per_order, min(c) lo, max(c) hi
  INTO r FROM (SELECT o, count(*) c FROM generate_series(1, 20000) o, stress.order_items(o) GROUP BY o) s;
  ASSERT r.lo >= 1 AND r.hi <= 6 AND r.per_order BETWEEN 2.7 AND 3.3, format('1-6 items, mean ~3: %s', r);

  SELECT count(*) = count(DISTINCT (o, product)) ok INTO r FROM generate_series(1, 20000) o, stress.order_items(o);
  ASSERT r.ok, 'an order never repeats a product';

  SELECT avg((product < 50000)::int) top INTO r FROM generate_series(1, 20000) o, stress.order_items(o);
  ASSERT r.top BETWEEN 0.29 AND 0.34, format('top 1%% of products get ~32%% of items (u^4): %s', r);

  ASSERT stress.order_total(5) = (SELECT sum(stress.price(product) * quantity) FROM stress.order_items(5)),
    'total is the sum of the items';

  SELECT count(DISTINCT stress.order_user(o)) n INTO r FROM generate_series(0, 499999, 1000) o;
  ASSERT r.n = 10, format('the first 500k orders belong to the 10 whales: %s', r);

  SELECT min(stress.order_user(o)) lo, max(stress.order_user(o)) hi INTO r FROM generate_series(500000, 600000) o;
  ASSERT r.lo >= 10 AND r.hi < 2000000, format('other orders go to non-whale users: %s', r);

  SELECT avg((s = 'delivered')::int) delivered, avg((s = 'shipped')::int) shipped,
         avg((s = 'paid')::int) paid, avg((s = 'cancelled')::int) cancelled
  INTO r FROM (SELECT stress.order_status(o) s FROM generate_series(1, 100000) o) x;
  ASSERT abs(r.delivered - 0.70) < 0.01 AND abs(r.shipped - 0.08) < 0.01
     AND abs(r.paid - 0.04) < 0.01 AND abs(r.cancelled - 0.18) < 0.01, format('status mix 70/8/4/18: %s', r);

  SELECT bool_and(stress.order_status(o) = 'cancelled') only_cancelled
  INTO r FROM generate_series(1, 100000) o WHERE stress.payment_status(o) = 'failed';
  ASSERT r.only_cancelled, 'only cancelled orders have failed payments';

  SELECT avg((stress.payment_status(o) = 'failed')::int) half INTO r
  FROM generate_series(1, 100000) o WHERE stress.order_status(o) = 'cancelled';
  ASSERT r.half BETWEEN 0.47 AND 0.53, format('half the cancelled orders failed payment: %s', r);

  SELECT min(stress.order_created_at(o)) lo, max(stress.order_created_at(o)) hi INTO r FROM generate_series(1, 100000) o;
  ASSERT r.hi - r.lo > interval '1070 days' AND r.hi - r.lo <= interval '1096 days', format('3 years of orders: %s', r);
END $$;

ROLLBACK;

\echo helpers ok

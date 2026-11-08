-- Runs in order_db after an attack (scripts/verify.sh) and reads the other databases through dblink.
-- Needs -v since=<run start> -v hot_initial=<hot stock at start> -v poll=<bool>; poll only prints whether the run settled.
\set ON_ERROR_STOP on

BEGIN;

CREATE EXTENSION dblink;

SELECT format('user=%s dbname=', current_user) AS conn, md5('product:0')::uuid AS hot_id \gset

CREATE TEMP TABLE run_orders AS
SELECT id, status::text FROM orders WHERE created_at >= :'since';

CREATE TEMP TABLE leftovers AS
SELECT 'product_db.stock_restorations' AS what, n
FROM dblink(:'conn' || 'product_db', 'SELECT count(*) FROM stock_restorations') AS t(n bigint)
UNION ALL
SELECT db || '.outbox (unpublished)', n
FROM unnest('{user_db,order_db,payment_db}'::text[]) db
CROSS JOIN LATERAL dblink(:'conn' || db, 'SELECT count(*) FROM outbox WHERE published_at IS NULL') AS t(n bigint);

\if :poll
SELECT NOT EXISTS (SELECT FROM run_orders WHERE status = 'pending')
   AND NOT EXISTS (SELECT FROM leftovers WHERE n > 0) AS settled;
\else
CREATE TEMP TABLE stock AS
SELECT * FROM dblink(:'conn' || 'product_db', format($q$
  SELECT (SELECT count(*) FROM products WHERE stock < 0),
         (SELECT stock FROM products WHERE id = %L)
$q$, :'hot_id')) AS t(negative bigint, hot_final integer);

CREATE TEMP TABLE hot_sold AS
SELECT coalesce(sum(i.quantity), 0) AS quantity
FROM order_items i JOIN run_orders o ON o.id = i.order_id
WHERE i.product_id = :'hot_id' AND o.status <> 'cancelled';

CREATE TEMP TABLE violations AS
SELECT format('%s products have negative stock', negative) AS violation FROM stock WHERE negative > 0
UNION ALL
SELECT format('hot product: initial %s - sold %s <> final %s', :hot_initial, h.quantity, s.hot_final)
FROM stock s, hot_sold h WHERE :hot_initial - h.quantity <> s.hot_final
UNION ALL
SELECT format('%s run orders are %s', count(*), status)
FROM run_orders WHERE status NOT IN ('paid', 'cancelled') GROUP BY status
UNION ALL
SELECT format('%s has %s rows', what, n) FROM leftovers WHERE n > 0;

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(violation, '; ') INTO bad FROM violations;
  ASSERT bad IS NULL, format('invariants violated: %s', bad);
END $$;

SELECT format('invariants ok: %s run orders', count(*)) AS result FROM run_orders \gset
\echo :result
\endif

ROLLBACK;

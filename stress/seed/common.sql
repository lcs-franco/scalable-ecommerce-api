-- Callers drop the `stress` schema before COMMIT so the schema stays the migrations'

\if :{?salt}
\else
  \set salt 20261030
\endif

CREATE SCHEMA stress;

CREATE FUNCTION stress.salt() RETURNS bigint IMMUTABLE LANGUAGE sql RETURN :salt;
CREATE FUNCTION stress.products() RETURNS bigint IMMUTABLE LANGUAGE sql RETURN :products;
CREATE FUNCTION stress.users() RETURNS bigint IMMUTABLE LANGUAGE sql RETURN :users;
CREATE FUNCTION stress.orders() RETURNS bigint IMMUTABLE LANGUAGE sql RETURN :orders;
CREATE FUNCTION stress.categories() RETURNS bigint IMMUTABLE LANGUAGE sql RETURN :categories;
CREATE FUNCTION stress.whale_orders() RETURNS bigint IMMUTABLE LANGUAGE sql RETURN :whale_orders;
CREATE FUNCTION stress.whales() RETURNS bigint IMMUTABLE LANGUAGE sql RETURN 10;
CREATE FUNCTION stress.epoch() RETURNS timestamptz IMMUTABLE LANGUAGE sql RETURN timestamptz '2023-10-01 00:00:00+00';

CREATE FUNCTION stress.uuid(kind text, n bigint) RETURNS uuid IMMUTABLE LANGUAGE sql
RETURN md5(kind || ':' || n)::uuid;

CREATE FUNCTION stress.email(u bigint) RETURNS text IMMUTABLE LANGUAGE sql
RETURN 'user' || u || '@stress.local';

CREATE FUNCTION stress.hash(stream text, n bigint) RETURNS bigint IMMUTABLE LANGUAGE sql
RETURN hashint8extended(n, hashtext(stream) # stress.salt()) & 281474976710655;

CREATE FUNCTION stress.unit(stream text, n bigint) RETURNS float8 IMMUTABLE LANGUAGE sql
RETURN stress.hash(stream, n)::float8 / 281474976710656;

CREATE FUNCTION stress.price(p bigint) RETURNS integer IMMUTABLE LANGUAGE sql
RETURN 100 + stress.hash('price', p) % 99900;

CREATE FUNCTION stress.product_category(p bigint) RETURNS bigint IMMUTABLE LANGUAGE sql
RETURN CASE
  WHEN p <> 0 AND stress.unit('monster', p) < 0.4 THEN 0
  ELSE 1 + stress.hash('category', p) % stress.categories()
END;

CREATE FUNCTION stress.word(i integer) RETURNS text IMMUTABLE LANGUAGE sql
RETURN (
  SELECT s[1 + x / 576] || s[1 + x / 24 % 24] || s[1 + x % 24]
  FROM (SELECT (i * 5003) % 13824 AS x) v,
       (SELECT '{ka,lo,mi,ne,su,ta,ri,vo,pe,du,an,el,or,is,ul,be,co,fa,gi,ho,ju,ly,qu,ze}'::text[] AS s) a
);

CREATE TABLE stress.paragraph AS
SELECT k, string_agg(stress.word(floor(500 * stress.unit('word', k * 256 + w) ^ 4)::integer), ' ' ORDER BY w) AS body
FROM generate_series(0, 1023) k
CROSS JOIN LATERAL generate_series(1, 100 + (stress.hash('paragraph-length', k) % 101)::integer) w
GROUP BY k;

ALTER TABLE stress.paragraph ADD PRIMARY KEY (k);

-- a set-returning function so `CROSS JOIN LATERAL stress.description(p)` gets inlined
CREATE FUNCTION stress.description(p bigint) RETURNS TABLE (description text) STABLE LANGUAGE sql
BEGIN ATOMIC
  SELECT left(string_agg(body, ' ' ORDER BY i), len)
  FROM (SELECT (2048 + stress.hash('description-length', p) % 6145)::integer AS len) l
  CROSS JOIN LATERAL generate_series(1, ceil(len / 700.0)::integer) i
  JOIN stress.paragraph ON k = stress.hash('paragraph', p * 16 + i) % 1024
  GROUP BY len;
END;

CREATE FUNCTION stress.order_user(o bigint) RETURNS bigint IMMUTABLE LANGUAGE sql
RETURN CASE
  WHEN o < stress.whales() * stress.whale_orders() THEN o / stress.whale_orders()
  ELSE stress.whales() + floor((stress.users() - stress.whales()) * stress.unit('order-user', o) ^ 2)::bigint
END;

CREATE FUNCTION stress.order_status(o bigint) RETURNS text IMMUTABLE LANGUAGE sql
RETURN CASE
  WHEN stress.unit('status', o) < 0.70 THEN 'delivered'
  WHEN stress.unit('status', o) < 0.78 THEN 'shipped'
  WHEN stress.unit('status', o) < 0.82 THEN 'paid'
  ELSE 'cancelled'
END;

CREATE FUNCTION stress.payment_status(o bigint) RETURNS text IMMUTABLE LANGUAGE sql
RETURN CASE
  WHEN stress.order_status(o) = 'cancelled' AND stress.unit('payment', o) < 0.5 THEN 'failed'
  ELSE 'confirmed'
END;

CREATE FUNCTION stress.order_created_at(o bigint) RETURNS timestamptz IMMUTABLE LANGUAGE sql
RETURN stress.epoch() + stress.unit('order-created', o) * interval '1095 days';

-- line n of order o is item o * 8 + n; a repeated product keeps its first line
CREATE FUNCTION stress.order_items(o bigint)
RETURNS TABLE (line integer, product bigint, quantity integer)
IMMUTABLE LANGUAGE sql
BEGIN ATOMIC
  SELECT DISTINCT ON (product) line, product, quantity
  FROM (
    SELECT j AS line,
           floor(stress.products() * stress.unit('item-product', o * 8 + j) ^ 4)::bigint AS product,
           1 + floor(3 * stress.unit('item-quantity', o * 8 + j) ^ 3)::integer AS quantity
    FROM generate_series(1, 1 + floor(6 * stress.unit('item-count', o) ^ 1.4)::integer) j
  ) items
  ORDER BY product, line;
END;

CREATE FUNCTION stress.order_total(o bigint) RETURNS integer IMMUTABLE LANGUAGE sql
RETURN (SELECT sum(stress.price(product) * quantity)::integer FROM stress.order_items(o));

-- drops PK/unique/FK constraints of the tables (and FKs pointing at them) for the bulk load
CREATE TABLE stress.dropped_constraint (rel regclass, name name, def text, kind "char");

CREATE PROCEDURE stress.drop_constraints(tables regclass[]) LANGUAGE plpgsql AS $$
DECLARE
  c record;
BEGIN
  INSERT INTO stress.dropped_constraint
  SELECT conrelid::regclass, conname, pg_get_constraintdef(oid), contype
  FROM pg_constraint
  WHERE contype IN ('p', 'u', 'f') AND (conrelid = ANY (tables) OR confrelid = ANY (tables));

  FOR c IN SELECT * FROM stress.dropped_constraint ORDER BY kind <> 'f' LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.rel, c.name);
  END LOOP;
END $$;

CREATE PROCEDURE stress.restore_constraints() LANGUAGE plpgsql AS $$
DECLARE
  c record;
BEGIN
  FOR c IN SELECT * FROM stress.dropped_constraint ORDER BY kind = 'f' LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', c.rel, c.name, c.def);
  END LOOP;
END $$;

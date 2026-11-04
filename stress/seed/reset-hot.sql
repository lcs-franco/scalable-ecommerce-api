\set ON_ERROR_STOP on

\if :{?hot_stock}
\else
  \set hot_stock 100
\endif

UPDATE products SET stock = :hot_stock, updated_at = now() WHERE id = md5('product:0')::uuid;

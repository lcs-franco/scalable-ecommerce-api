\set ON_ERROR_STOP on

SET synchronous_commit = off;
SET maintenance_work_mem = '1GB';

BEGIN;

\ir common.sql

SELECT EXISTS (SELECT FROM payments WHERE id = stress.uuid('payment', 0)) AS seeded \gset

\if :seeded
  \echo already seeded, skipping
  ROLLBACK;
  \quit
\endif

CALL stress.drop_constraints('{payments}');

INSERT INTO payments (id, order_id, user_id, user_email, amount, status, provider, provider_payment_id,
                      failure_reason, created_at, updated_at)
SELECT stress.uuid('payment', o), stress.uuid('order', o), stress.uuid('user', u), stress.email(u),
       stress.order_total(o), status::payment_status, 'stripe', 'pi_' || left(md5('pi:' || o), 24),
       CASE WHEN status = 'failed'
         THEN (ARRAY['Your card was declined.', 'Your card has insufficient funds.', 'Your card has expired.'])
              [1 + stress.hash('failure-reason', o) % 3]
       END,
       created, created + interval '5 seconds'
FROM generate_series(0, stress.orders() - 1) o
CROSS JOIN LATERAL (
  SELECT stress.order_user(o) AS u, stress.payment_status(o) AS status,
         stress.order_created_at(o) + interval '2 seconds' AS created
) c;

CALL stress.restore_constraints();

SET LOCAL client_min_messages = warning;
DROP SCHEMA stress CASCADE;

COMMIT;

-- parallel vacuum overflows Docker's 64 MB /dev/shm
VACUUM (ANALYZE, PARALLEL 0);

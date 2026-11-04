\set ON_ERROR_STOP on
-- bcrypt (cost 12) of 'stress-password'
\set password_hash '$2b$12$ZO7t61RqXDeCJxf2SvLIw.Svbs8ZuXvrq917jijzdT7aD.MgclJnK'

SET synchronous_commit = off;
SET maintenance_work_mem = '1GB';

BEGIN;

\ir common.sql

SELECT EXISTS (SELECT FROM users WHERE id = stress.uuid('user', 0)) AS seeded \gset

\if :seeded
  \echo already seeded, skipping
  ROLLBACK;
  \quit
\endif

CALL stress.drop_constraints('{users}');

INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
SELECT stress.uuid('user', u), stress.email(u), :'password_hash', 'User ' || u, 'user'::role, t, t
FROM generate_series(0, stress.users() - 1) u
CROSS JOIN LATERAL (SELECT stress.epoch() - stress.unit('user-created', u) * interval '365 days' AS t) c
UNION ALL
SELECT stress.uuid('admin', 0), 'admin@stress.local', :'password_hash', 'Stress Admin', 'admin'::role,
       stress.epoch() - interval '366 days', stress.epoch() - interval '366 days';

CALL stress.restore_constraints();

SET LOCAL client_min_messages = warning;
DROP SCHEMA stress CASCADE;

COMMIT;

-- parallel vacuum overflows Docker's 64 MB /dev/shm
VACUUM (ANALYZE, PARALLEL 0);

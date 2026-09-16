#!/bin/bash
set -e

# This script runs on first Postgres boot via /docker-entrypoint-initdb.d/
# It creates the additional databases (the default DB is already created by POSTGRES_DB).

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE product_db;
    CREATE DATABASE order_db;
    CREATE DATABASE payment_db;
EOSQL

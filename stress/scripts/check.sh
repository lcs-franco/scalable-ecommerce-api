#!/bin/sh
# Needs the same SEED_* env the seed used
set -eu

cd "$(dirname "$0")/.."

compose='docker compose -f compose.yaml'

$compose run --rm --no-deps -T -v "$PWD:/stress:ro" stress-seed sh -c '
  set -e
  . /seed/params.sh
  vars="-v products=$products -v users=$users -v orders=$orders -v categories=$categories -v whale_orders=$whale_orders -v hot_stock=$hot_stock -v salt=$salt"
  psql -X -q -d product_db -f /stress/checks/helpers.sql
  psql -X -q -d order_db -f /stress/checks/invariants.sql $vars
'

cart="cart:$(printf 'user:10' | md5sum | sed -E 's/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/\1-\2-\3-\4-\5/')"
items=$($compose exec -T redis redis-cli HLEN "$cart")

if [ "$items" != 1000 ]; then
  echo "cart of user 10 has $items items, expected 1000" >&2
  exit 1
fi

echo 'carts ok'

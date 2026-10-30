#!/bin/sh
set -eu -o pipefail

. /seed/params.sh

echo "scale=$scale products=$products users=$users orders=$orders categories=$categories whale_orders=$whale_orders"

run() {
  name=$1
  start=$(date +%s)

  psql -X -q -d "${name}_db" -f "/seed/$name.sql" \
    -v products="$products" -v users="$users" -v orders="$orders" -v categories="$categories" \
    -v whale_orders="$whale_orders" -v hot_stock="$hot_stock" -v salt="$salt" 2>&1 |
    sed "s/^/[${name}_db] /"

  echo "[${name}_db] done in $(($(date +%s) - start))s"
}

pids=''

for name in user product order payment; do
  run "$name" &
  pids="$pids $!"
done

failed=0

for pid in $pids; do
  wait "$pid" || failed=1
done

exit "$failed"

#!/bin/sh
# attack.sh <scenario> [k6 args]: runs scenarios/<scenario>.ts, then verifies the invariants
set -eu

cd "$(dirname "$0")/.."

scenario=${1:?usage: attack.sh <scenario> [k6 args]}
shift

compose='docker compose -f compose.yaml'

query() {
  $compose exec -T postgres sh -c 'psql -X -At -U "$POSTGRES_USER" "$@"' sh "$@"
}

since=$(query -d order_db -c 'SELECT now()')
hot_initial=$(query -d product_db -c "SELECT stock FROM products WHERE id = md5('product:0')::uuid")

# A crashed attack must not leak its faults into this one
curl -fsS -X POST "http://$($compose port toxiproxy 8474)/reset"

mkdir -p results

# k6 tolerates Prometheus being down but logs an error on every flush
output=
if [ -n "$($compose ps --status running -q prometheus)" ]; then
  output='-o experimental-prometheus-rw'
fi

# results/ is a bind mount: k6 runs as the host user to write its summary there
k6_status=0
$compose run --rm --no-deps --user "$(id -u):$(id -g)" k6 run $output "scenarios/$scenario.ts" "$@" || k6_status=$?

verify_status=0
scripts/verify.sh --since "$since" --hot-initial "$hot_initial" || verify_status=$?

if [ "$k6_status" -ne 0 ] || [ "$verify_status" -ne 0 ]; then
  echo "$scenario: k6 exited $k6_status, verify exited $verify_status" >&2
  exit 1
fi

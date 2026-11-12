#!/bin/sh
# attack.sh <scenario> [k6 args]: runs scenarios/<scenario>.ts, then verifies the invariants
# and that no container died during the run
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

# Services restart on failure, so a crash shows up only as a die (or oom) event
containers=$($compose ps -q)
started=$(date +%s)

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

# One second past now, so events of the final second are included
deaths=$(docker events --since "$started" --until "$(($(date +%s) + 1))" \
  --filter event=die --filter event=oom $(printf -- '--filter container=%s ' $containers) \
  --format '{{.Action}} {{index .Actor.Attributes "com.docker.compose.service"}} exitCode={{index .Actor.Attributes "exitCode"}}')

container_status=0
if [ -n "$deaths" ]; then
  echo "containers died during the run:" >&2
  echo "$deaths" >&2
  container_status=1
fi

if [ "$k6_status" -ne 0 ] || [ "$verify_status" -ne 0 ] || [ "$container_status" -ne 0 ]; then
  echo "$scenario: k6 exited $k6_status, verify exited $verify_status, container check exited $container_status" >&2
  exit 1
fi

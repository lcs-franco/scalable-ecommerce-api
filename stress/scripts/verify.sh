#!/bin/sh
# verify.sh --since <run start> --hot-initial <hot stock at start>
# Waits until the run settles (or VERIFY_TIMEOUT seconds), then checks the invariants
set -eu

cd "$(dirname "$0")/.."

while [ $# -gt 0 ]; do
  case $1 in
    --since) since=$2; shift 2 ;;
    --hot-initial) hot_initial=$2; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

: "${since:?--since is required}" "${hot_initial:?--hot-initial is required}"

after_run() {
  docker compose -f compose.yaml exec -T postgres \
    sh -c 'psql -X -q -U "$POSTGRES_USER" -d order_db "$@"' sh \
    -v since="$since" -v hot_initial="$hot_initial" "$@" < checks/after-run.sql
}

timeout=${VERIFY_TIMEOUT:-60}
deadline=$(($(date +%s) + timeout))

until [ "$(after_run -At -v poll=true)" = t ]; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "run not settled after ${timeout}s, checking anyway" >&2
    break
  fi

  sleep 2
done

after_run -v poll=false

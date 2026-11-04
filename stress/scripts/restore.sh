#!/bin/sh
set -eu

. "$(dirname "$0")/volumes.sh"

from=$(snapshot "${1:-seed}")

if ! docker volume inspect "$from" > /dev/null 2>&1; then
  echo "no snapshot volume $from" >&2
  exit 1
fi

copy_volume "$from" "$data"

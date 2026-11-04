#!/bin/sh
set -eu

. "$(dirname "$0")/volumes.sh"

copy_volume "$data" "$(snapshot "${1:-seed}")"

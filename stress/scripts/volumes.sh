project=ecommerce-stress
compose="docker compose -f $(dirname "$0")/../compose.yaml"
data="${project}_postgres-data"

snapshot() {
  echo "${project}_postgres-snapshot-$1"
}

# copy_volume <from> <to>: file-level copy with Postgres stopped
copy_volume() {
  start=$(date +%s)

  $compose stop postgres

  docker run --rm -v "$1:/from:ro" -v "$2:/to" alpine:3.20 \
    sh -c 'find /to -mindepth 1 -delete && cp -a /from/. /to/'

  $compose up -d --wait postgres

  echo "copied $1 -> $2 in $(($(date +%s) - start))s"
}

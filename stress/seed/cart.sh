#!/bin/sh
set -eu

. /seed/params.sh

uuid() {
  printf '%s' "$1" | md5sum | sed -E 's/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/\1-\2-\3-\4-\5/'
}

cart() {
  key="cart:$(uuid "user:$1")"
  shift

  printf 'DEL %s\nHSET %s%s\nEXPIRE %s 604800\n' "$key" "$key" "$*" "$key"
}

commands=$(mktemp)

big=''
stride=$(((products - 1) / 1000))

for i in $(seq 1 1000); do
  big="$big $(uuid "product:$((i * stride))") 1"
done

cart 10 "$big" > "$commands"

for u in $(seq 11 110); do
  items=''

  for i in $(seq 1 $((1 + u % 5))); do
    items="$items $(uuid "product:$((1 + (u * 7919 + i * 104729) % (products - 1))))") $((1 + i % 3))"
  done

  cart "$u" "$items" >> "$commands"
done

redis-cli -h redis < "$commands" > /dev/null

echo "carts seeded: user 10 has $(redis-cli -h redis HLEN "cart:$(uuid user:10)") items"

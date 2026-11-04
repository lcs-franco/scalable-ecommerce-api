scale=${SEED_SCALE:-1}

# size <override> <full-scale count> <floor>
size() {
  awk -v o="$1" -v n="$2" -v s="$scale" -v min="$3" 'BEGIN {
    v = o != "" ? o : int(n * s + 0.5)

    print (v < min ? min : v)
  }'
}

products=$(size "${SEED_PRODUCTS:-}" 5000000 1001)
users=$(size "${SEED_USERS:-}" 2000000 111)
orders=$(size "${SEED_ORDERS:-}" 20000000 1)
categories=$(size '' 1000 10)
whale_orders=$(size '' 50000 1)

# whales keep 2.5% of the orders when SEED_ORDERS shrinks them
whale_orders=$(awk -v w="$whale_orders" -v o="$orders" 'BEGIN {
  c = int(o / 400)

  if (c < 1) c = 1

  print (w > c ? c : w)
}')

hot_stock=${HOT_STOCK:-100}
salt=${SEED_SALT:-20261030}

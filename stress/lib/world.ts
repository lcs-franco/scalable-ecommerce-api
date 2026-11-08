import crypto from 'k6/crypto'

const scale = Number(__ENV.SEED_SCALE || 1)

// Same sizes as seed/params.sh, so SEED_* must match what the world was seeded with
function size(override: string | undefined, fullScale: number, floor: number) {
  const value = override ? Number(override) : Math.round(fullScale * scale)

  return Math.max(value, floor)
}

export const PRODUCTS = size(__ENV.SEED_PRODUCTS, 5_000_000, 1001)
const WHALES = 10
const SEEDED_CARTS = 101

export const FIRST_PLAIN_USER = WHALES + SEEDED_CARTS

export const USERS = size(__ENV.SEED_USERS, 2_000_000, FIRST_PLAIN_USER)

export const HOT_PRODUCT = 0
export const PASSWORD = 'stress-password'

export function uuid(kind: 'product' | 'user', n: number) {
  const hex = crypto.md5(`${kind}:${n}`, 'hex')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function email(user: number) {
  return `user${user}@stress.local`
}

// The seed's popularity (floor(products × u⁴)); rejecting the hot product keeps the rest's shape
export function pickProduct({ includeHot = false } = {}) {
  for (;;) {
    const product = Math.floor(PRODUCTS * Math.random() ** 4)

    if (includeHot || product !== HOT_PRODUCT) return product
  }
}

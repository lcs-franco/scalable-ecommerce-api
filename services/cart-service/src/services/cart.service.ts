import { CartEmpty, ItemNotInCart } from '../errors/index.js'
import type { RedisClient } from '../redis.js'
import type { IProductInfo } from './product.client.js'

const CART_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

function cartKey(userId: string) {
  return `cart:${userId}`
}

export interface ICartItem {
  productId: string
  quantity: number
}

export interface IEnrichedCartItem {
  productId: string
  name: string | null
  price: number | null
  quantity: number
  lineTotal: number | null
  unavailable: boolean
}

function parseCartHash(raw: Record<string, string>): ICartItem[] {
  return Object.entries(raw).map(([productId, qty]) => ({
    productId,
    quantity: parseInt(qty, 10),
  }))
}

export function createCartService(redis: RedisClient) {
  async function addItem(userId: string, productId: string, quantity: number) {
    const key = cartKey(userId)
    await redis.hset(key, productId, quantity)
    await redis.expire(key, CART_TTL_SECONDS)
  }

  async function updateItem(
    userId: string,
    productId: string,
    quantity: number,
  ) {
    const key = cartKey(userId)
    const exists = await redis.hexists(key, productId)
    if (!exists) throw new ItemNotInCart()

    await redis.hset(key, productId, quantity)
    await redis.expire(key, CART_TTL_SECONDS)
  }

  async function removeItem(userId: string, productId: string) {
    const key = cartKey(userId)
    const removed = await redis.hdel(key, productId)
    if (removed === 0) throw new ItemNotInCart()

    const remaining = await redis.hlen(key)
    if (remaining > 0) await redis.expire(key, CART_TTL_SECONDS)
  }

  async function getItems(userId: string): Promise<ICartItem[]> {
    const raw = await redis.hgetall(cartKey(userId))
    return parseCartHash(raw)
  }

  function enrichItems(
    items: ICartItem[],
    products: Map<string, IProductInfo>,
  ): { items: IEnrichedCartItem[]; total: number } {
    const enriched = items.map((item) => {
      const product = products.get(item.productId)
      return {
        productId: item.productId,
        name: product?.name ?? null,
        price: product?.price ?? null,
        quantity: item.quantity,
        lineTotal: product ? product.price * item.quantity : null,
        unavailable: !product,
      }
    })
    const total = enriched.reduce((sum, i) => sum + (i.lineTotal ?? 0), 0)
    return { items: enriched, total }
  }

  async function clear(userId: string) {
    await redis.del(cartKey(userId))
  }

  async function checkout(userId: string): Promise<ICartItem[]> {
    const key = cartKey(userId)
    const multi = redis.multi()
    multi.hgetall(key)
    multi.del(key)
    const results = await multi.exec()

    if (!results) throw new CartEmpty()

    const [err, raw] = results[0] as [Error | null, Record<string, string>]
    if (err) throw err
    if (!raw || Object.keys(raw).length === 0) throw new CartEmpty()

    return parseCartHash(raw)
  }

  return {
    addItem,
    updateItem,
    removeItem,
    getItems,
    enrichItems,
    clear,
    checkout,
  }
}

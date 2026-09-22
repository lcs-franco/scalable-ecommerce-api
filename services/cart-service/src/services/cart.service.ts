import { CartEmpty, ItemNotInCart } from '../errors/index.js'
import type { RedisClient } from '../redis.js'

const CART_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

function cartKey(userId: string) {
  return `cart:${userId}`
}

export interface ICartItem {
  productId: string
  quantity: number
}

export function createCartService(redis: RedisClient) {
  async function addItem(userId: string, productId: string, quantity: number) {
    const key = cartKey(userId)
    await redis.hincrby(key, productId, quantity)
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

    if (quantity <= 0) {
      await redis.hdel(key, productId)
    } else {
      await redis.hset(key, productId, quantity)
    }
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
    return Object.entries(raw).map(([productId, qty]) => ({
      productId,
      quantity: parseInt(qty, 10),
    }))
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

    return Object.entries(raw).map(([productId, qty]) => ({
      productId,
      quantity: parseInt(qty, 10),
    }))
  }

  return { addItem, updateItem, removeItem, getItems, clear, checkout }
}

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Redis } from 'ioredis'
import { cleanRedis, createTestApp, userToken } from './helpers.js'

let app: Awaited<ReturnType<typeof createTestApp>>['app']
let redis: Redis
let token: string

beforeAll(async () => {
  const ctx = await createTestApp()
  app = ctx.app
  redis = ctx.redis
  token = userToken(app)
}, 30000)

afterEach(async () => {
  await cleanRedis(redis)
})

afterAll(async () => {
  await app.close()
  redis.disconnect()
}, 30000)

describe('POST /cart/items', () => {
  it('adds an item to the cart', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cart/items',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        productId: '00000000-0000-0000-0000-000000000001',
        quantity: 2,
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().message).toBe('Item added to cart')

    const qty = await redis.hget(
      'cart:user-id',
      '00000000-0000-0000-0000-000000000001',
    )
    expect(qty).toBe('2')
  })

  it('overwrites quantity on repeated adds (idempotent)', async () => {
    const productId = '00000000-0000-0000-0000-000000000001'

    await app.inject({
      method: 'POST',
      url: '/cart/items',
      headers: { authorization: `Bearer ${token}` },
      payload: { productId, quantity: 3 },
    })
    await app.inject({
      method: 'POST',
      url: '/cart/items',
      headers: { authorization: `Bearer ${token}` },
      payload: { productId, quantity: 2 },
    })

    const qty = await redis.hget('cart:user-id', productId)
    expect(qty).toBe('2')
  })

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cart/items',
      payload: {
        productId: '00000000-0000-0000-0000-000000000001',
        quantity: 1,
      },
    })
    expect(res.statusCode).toBe(401)
  })

  it('validates body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cart/items',
      headers: { authorization: `Bearer ${token}` },
      payload: { productId: 'not-a-uuid', quantity: 0 },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('PATCH /cart/items/:productId', () => {
  const productId = '00000000-0000-0000-0000-000000000001'

  it('updates item quantity', async () => {
    await redis.hset('cart:user-id', productId, '3')

    const res = await app.inject({
      method: 'PATCH',
      url: `/cart/items/${productId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quantity: 5 },
    })

    expect(res.statusCode).toBe(200)
    const qty = await redis.hget('cart:user-id', productId)
    expect(qty).toBe('5')
  })

  it('rejects quantity 0', async () => {
    await redis.hset('cart:user-id', productId, '3')

    const res = await app.inject({
      method: 'PATCH',
      url: `/cart/items/${productId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quantity: 0 },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for item not in cart', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/cart/items/${productId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quantity: 1 },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('ITEM_NOT_IN_CART')
  })
})

describe('DELETE /cart/items/:productId', () => {
  const productId = '00000000-0000-0000-0000-000000000001'

  it('removes item from cart', async () => {
    await redis.hset('cart:user-id', productId, '2')

    const res = await app.inject({
      method: 'DELETE',
      url: `/cart/items/${productId}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(204)
    const exists = await redis.hexists('cart:user-id', productId)
    expect(exists).toBe(0)
  })

  it('returns 404 for item not in cart', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/cart/items/${productId}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('GET /cart', () => {
  it('returns empty cart', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/cart',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ items: [], total: 0 })
  })

  it('returns cart items with unavailable flag when product-service is down', async () => {
    const productId = '00000000-0000-0000-0000-000000000001'
    await redis.hset('cart:user-id', productId, '2')

    const res = await app.inject({
      method: 'GET',
      url: '/cart',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toEqual({
      productId,
      name: null,
      price: null,
      quantity: 2,
      lineTotal: null,
      unavailable: true,
    })
    expect(body.total).toBe(0)
  })
})

describe('DELETE /cart', () => {
  it('clears entire cart', async () => {
    await redis.hset('cart:user-id', 'prod-a', '1')
    await redis.hset('cart:user-id', 'prod-b', '3')

    const res = await app.inject({
      method: 'DELETE',
      url: '/cart',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(204)
    const keys = await redis.hgetall('cart:user-id')
    expect(Object.keys(keys)).toHaveLength(0)
  })
})

describe('POST /cart/checkout', () => {
  it('returns cart items and clears cart atomically', async () => {
    const p1 = '00000000-0000-0000-0000-000000000001'
    const p2 = '00000000-0000-0000-0000-000000000002'
    await redis.hset('cart:user-id', p1, '2')
    await redis.hset('cart:user-id', p2, '1')

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { 'x-user-id': 'user-id' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(2)
    expect(body.items).toEqual(
      expect.arrayContaining([
        { productId: p1, quantity: 2 },
        { productId: p2, quantity: 1 },
      ]),
    )

    const remaining = await redis.hgetall('cart:user-id')
    expect(Object.keys(remaining)).toHaveLength(0)
  })

  it('returns 400 for empty cart', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { 'x-user-id': 'user-id' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('CART_EMPTY')
  })

  it('does not require JWT (internal endpoint)', async () => {
    await redis.hset('cart:user-id', 'prod-a', '1')

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { 'x-user-id': 'user-id' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('returns 400 without x-user-id header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('x-user-id header required')
  })
})

describe('TTL', () => {
  it('sets 7-day TTL on write operations', async () => {
    const productId = '00000000-0000-0000-0000-000000000001'

    await app.inject({
      method: 'POST',
      url: '/cart/items',
      headers: { authorization: `Bearer ${token}` },
      payload: { productId, quantity: 1 },
    })

    const ttl = await redis.ttl('cart:user-id')
    expect(ttl).toBeGreaterThan(604800 - 10)
    expect(ttl).toBeLessThanOrEqual(604800)
  })
})

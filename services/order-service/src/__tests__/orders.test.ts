import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  adminToken,
  cleanDb,
  createTestApp,
  mockCartClient,
  mockProductClient,
  userToken,
} from './helpers.js'

describe('order routes', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app']
  let db: Awaited<ReturnType<typeof createTestApp>>['db']
  let pool: Awaited<ReturnType<typeof createTestApp>>['pool']
  let publishers: Awaited<ReturnType<typeof createTestApp>>['publishers']

  beforeAll(async () => {
    const ctx = await createTestApp()
    app = ctx.app
    db = ctx.db
    pool = ctx.pool
    publishers = ctx.publishers
  })

  afterEach(async () => {
    await cleanDb(db)
    publishers.events.length = 0
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  async function placeTestOrder(token?: string) {
    return app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${token ?? userToken(app)}` },
    })
  }

  describe('POST /orders', () => {
    it('should place an order from cart', async () => {
      const res = await placeTestOrder()

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.id).toBeDefined()
      expect(body.userId).toBe('00000000-0000-0000-0000-000000000002')
      expect(body.status).toBe('pending')
      expect(body.total).toBe(3000) // (2 * 1000) + (1 * 1000)
      expect(body.items).toHaveLength(2)
      expect(body.items[0].productName).toBe(
        'Product 00000000-0000-0000-0000-000000000101',
      )
    })

    it('should publish order.placed event', async () => {
      await placeTestOrder()

      expect(publishers.events).toHaveLength(1)
      expect(publishers.events[0].topic).toBe('order.placed')
    })

    it('should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/orders',
      })
      expect(res.statusCode).toBe(401)
    })

    it('should compensate cart on product validation failure', async () => {
      let cartRestored = false
      const cartClient = mockCartClient()
      cartClient.restore = async () => {
        cartRestored = true
      }
      const productClient = mockProductClient()
      productClient.validateOrder = async () => {
        throw new Error('Insufficient stock')
      }

      const ctx = await createTestApp({ cartClient, productClient })
      try {
        const res = await ctx.app.inject({
          method: 'POST',
          url: '/orders',
          headers: { authorization: `Bearer ${userToken(ctx.app)}` },
        })
        expect(res.statusCode).toBe(500)
        expect(cartRestored).toBe(true)
      } finally {
        await ctx.app.close()
        await ctx.pool.end()
      }
    })
  })

  describe('GET /orders', () => {
    it('should list own orders for user', async () => {
      await placeTestOrder()
      await placeTestOrder()

      const res = await app.inject({
        method: 'GET',
        url: '/orders',
        headers: { authorization: `Bearer ${userToken(app)}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.items).toHaveLength(2)
      expect(body.total).toBe(2)
    })

    it('should list all orders for admin', async () => {
      await placeTestOrder(
        userToken(app, '00000000-0000-0000-0000-00000000000a'),
      )
      await placeTestOrder(
        userToken(app, '00000000-0000-0000-0000-00000000000b'),
      )

      const res = await app.inject({
        method: 'GET',
        url: '/orders',
        headers: { authorization: `Bearer ${adminToken(app)}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().items.length).toBeGreaterThanOrEqual(2)
    })

    it('should filter by status for admin', async () => {
      await placeTestOrder()

      const res = await app.inject({
        method: 'GET',
        url: '/orders?status=shipped',
        headers: { authorization: `Bearer ${adminToken(app)}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().items).toHaveLength(0)
    })
  })

  describe('GET /orders/:id', () => {
    it('should return order with items', async () => {
      const createRes = await placeTestOrder()
      const orderId = createRes.json().id

      const res = await app.inject({
        method: 'GET',
        url: `/orders/${orderId}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe(orderId)
      expect(body.items).toHaveLength(2)
    })

    it('should return 403 when user tries to access another users order', async () => {
      const createRes = await placeTestOrder(
        userToken(app, '00000000-0000-0000-0000-00000000000a'),
      )
      const orderId = createRes.json().id

      const res = await app.inject({
        method: 'GET',
        url: `/orders/${orderId}`,
        headers: {
          authorization: `Bearer ${userToken(app, '00000000-0000-0000-0000-00000000000b')}`,
        },
      })

      expect(res.statusCode).toBe(403)
    })

    it('should allow admin to access any order', async () => {
      const createRes = await placeTestOrder()
      const orderId = createRes.json().id

      const res = await app.inject({
        method: 'GET',
        url: `/orders/${orderId}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      })

      expect(res.statusCode).toBe(200)
    })

    it('should return 404 for nonexistent order', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/orders/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${userToken(app)}` },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe('PATCH /orders/:id/status', () => {
    it('should update status as admin', async () => {
      const createRes = await placeTestOrder()
      const orderId = createRes.json().id

      const res = await app.inject({
        method: 'PATCH',
        url: `/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { status: 'paid' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('paid')
    })

    it('should publish order.status-changed event', async () => {
      const createRes = await placeTestOrder()
      const orderId = createRes.json().id
      publishers.events.length = 0

      await app.inject({
        method: 'PATCH',
        url: `/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { status: 'paid' },
      })

      expect(publishers.events).toHaveLength(1)
      expect(publishers.events[0].topic).toBe('order.status-changed')
    })

    it('should reject invalid status transition', async () => {
      const createRes = await placeTestOrder()
      const orderId = createRes.json().id

      const res = await app.inject({
        method: 'PATCH',
        url: `/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { status: 'delivered' },
      })

      expect(res.statusCode).toBe(409)
    })

    it('should return 403 for non-admin', async () => {
      const createRes = await placeTestOrder()
      const orderId = createRes.json().id

      const res = await app.inject({
        method: 'PATCH',
        url: `/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { status: 'paid' },
      })

      expect(res.statusCode).toBe(403)
    })
  })
})

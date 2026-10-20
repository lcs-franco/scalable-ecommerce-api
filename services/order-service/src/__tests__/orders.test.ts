import { Topics } from '@ecommerce/events'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CartEmpty, InsufficientStock } from '../errors/index.js'
import {
  adminToken,
  cleanDb,
  createTestApp,
  DEFAULT_USER_EMAIL,
  DEFAULT_USER_ID,
  mockCartClient,
  mockProductClient,
  outboxEvents,
  PRODUCT_1,
  PRODUCT_2,
  userToken,
} from './helpers.js'

describe('order routes', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app']
  let db: Awaited<ReturnType<typeof createTestApp>>['db']
  let pool: Awaited<ReturnType<typeof createTestApp>>['pool']

  beforeAll(async () => {
    const ctx = await createTestApp()
    app = ctx.app
    db = ctx.db
    pool = ctx.pool
  })

  afterEach(async () => {
    await cleanDb(db)
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  function setStatus(orderId: string, status: string, target = app) {
    return target.inject({
      method: 'PATCH',
      url: `/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${adminToken(target)}` },
      payload: { status },
    })
  }

  async function orderStatus(orderId: string) {
    const res = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}`,
      headers: { authorization: `Bearer ${adminToken(app)}` },
    })
    return res.json().status
  }

  function statusChanges(target = db) {
    return outboxEvents(target, Topics.ORDER_STATUS_CHANGED)
  }

  const PAYMENT_METHOD_ID = 'pm_card_visa'

  async function placeTestOrder(token?: string, target = app) {
    return target.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${token ?? userToken(target)}` },
      payload: { paymentMethodId: PAYMENT_METHOD_ID },
    })
  }

  const ORDER_ITEMS = [
    { productId: PRODUCT_1, quantity: 2 },
    { productId: PRODUCT_2, quantity: 1 },
  ]

  async function withApp(
    overrides: Parameters<typeof createTestApp>[0],
    fn: (ctx: Awaited<ReturnType<typeof createTestApp>>) => Promise<void>,
  ) {
    const ctx = await createTestApp(overrides)
    try {
      await fn(ctx)
    } finally {
      await ctx.app.close()
      await ctx.pool.end()
    }
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

    it('should enqueue order.placed keyed by order with recipient and item names', async () => {
      const res = await placeTestOrder()

      expect(await outboxEvents(db)).toEqual([
        {
          topic: 'order.placed',
          key: res.json().id,
          data: {
            orderId: res.json().id,
            userId: DEFAULT_USER_ID,
            email: DEFAULT_USER_EMAIL,
            items: [
              {
                productId: PRODUCT_1,
                name: `Product ${PRODUCT_1}`,
                quantity: 2,
                price: 1000,
              },
              {
                productId: PRODUCT_2,
                name: `Product ${PRODUCT_2}`,
                quantity: 1,
                price: 1000,
              },
            ],
            total: 3000,
            paymentMethodId: PAYMENT_METHOD_ID,
          },
        },
      ])
    })

    it('should store neither the order nor the event when the event is rejected', async () => {
      const token = app.jwt.sign({
        userId: DEFAULT_USER_ID,
        email: 'not-an-email',
        role: 'user',
      })

      const res = await placeTestOrder(token)

      expect(res.statusCode).toBe(400)
      expect(await listAllOrders(app)).toEqual([])
      expect(await outboxEvents(db)).toEqual([])
    })

    it.each([
      ['missing', {}],
      ['empty', { paymentMethodId: '' }],
    ])('should return 400 when paymentMethodId is %s', async (_, payload) => {
      const res = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload,
      })

      expect(res.statusCode).toBe(400)
      expect(await outboxEvents(db)).toEqual([])
    })

    it('should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/orders',
      })
      expect(res.statusCode).toBe(401)
    })

    async function listAllOrders(target: typeof app) {
      const res = await target.inject({
        method: 'GET',
        url: '/orders',
        headers: { authorization: `Bearer ${adminToken(target)}` },
      })
      return res.json().items
    }

    it('should return 400 CART_EMPTY and create nothing when the cart is empty', async () => {
      const cartClient = mockCartClient()
      cartClient.checkout = async () => {
        throw new CartEmpty()
      }

      await withApp({ cartClient }, async (ctx) => {
        const res = await placeTestOrder(undefined, ctx.app)

        expect(res.statusCode).toBe(400)
        expect(res.json()).toEqual({
          error: 'CART_EMPTY',
          message: 'Cart is empty',
        })
        expect(await listAllOrders(ctx.app)).toEqual([])
        expect(await outboxEvents(ctx.db)).toEqual([])
      })
    })

    it('should return 409 INSUFFICIENT_STOCK and restore the cart', async () => {
      let cartRestored = false
      const cartClient = mockCartClient()
      cartClient.restore = async () => {
        cartRestored = true
      }
      const productClient = mockProductClient()
      productClient.validateOrder = async () => {
        throw new InsufficientStock(
          `Insufficient stock for product ${PRODUCT_1}`,
        )
      }

      await withApp({ cartClient, productClient }, async (ctx) => {
        const res = await placeTestOrder(undefined, ctx.app)

        expect(res.statusCode).toBe(409)
        expect(res.json()).toEqual({
          error: 'INSUFFICIENT_STOCK',
          message: `Insufficient stock for product ${PRODUCT_1}`,
        })
        expect(cartRestored).toBe(true)
        expect(await listAllOrders(ctx.app)).toEqual([])
        expect(await outboxEvents(ctx.db)).toEqual([])
      })
    })

    it('should return 500 and restore the cart on an unexpected product failure', async () => {
      let cartRestored = false
      const cartClient = mockCartClient()
      cartClient.restore = async () => {
        cartRestored = true
      }
      const productClient = mockProductClient()
      productClient.validateOrder = async () => {
        throw new Error('Product validation failed: 502 Bad Gateway')
      }

      await withApp({ cartClient, productClient }, async (ctx) => {
        const res = await placeTestOrder(undefined, ctx.app)

        expect(res.statusCode).toBe(500)
        expect(cartRestored).toBe(true)
      })
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

  describe('markAsPaid', () => {
    it('should enqueue order.status-changed event', async () => {
      const createRes = await placeTestOrder()
      const orderId = createRes.json().id

      const ctx = await createTestApp()
      try {
        await ctx.app.orderService.markAsPaid(orderId)

        expect(await statusChanges(ctx.db)).toEqual([
          {
            topic: 'order.status-changed',
            key: orderId,
            data: {
              orderId,
              userId: DEFAULT_USER_ID,
              email: DEFAULT_USER_EMAIL,
              status: 'paid',
            },
          },
        ])
      } finally {
        await ctx.app.close()
        await ctx.pool.end()
      }
    })

    it('should not enqueue an event when order is not pending', async () => {
      const createRes = await placeTestOrder()
      const orderId = createRes.json().id

      // move to paid first
      await app.inject({
        method: 'PATCH',
        url: `/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { status: 'paid' },
      })

      const before = await statusChanges()

      const ctx = await createTestApp()
      try {
        await ctx.app.orderService.markAsPaid(orderId)
        expect(await statusChanges(ctx.db)).toEqual(before)
      } finally {
        await ctx.app.close()
        await ctx.pool.end()
      }
    })
  })

  describe('markAsCancelled', () => {
    it('should restore stock, cancel and enqueue order.status-changed', async () => {
      const orderId = (await placeTestOrder()).json().id
      const productClient = mockProductClient()

      await withApp({ productClient }, async (ctx) => {
        await ctx.app.orderService.markAsCancelled(orderId)

        expect(productClient.restoreOrderStockCalls).toEqual([
          { orderId, items: ORDER_ITEMS },
        ])
        expect(await orderStatus(orderId)).toBe('cancelled')
        expect(await statusChanges(ctx.db)).toEqual([
          {
            topic: 'order.status-changed',
            key: orderId,
            data: {
              orderId,
              userId: DEFAULT_USER_ID,
              email: DEFAULT_USER_EMAIL,
              status: 'cancelled',
            },
          },
        ])
      })
    })

    it('should restore stock only once when the event is redelivered', async () => {
      const orderId = (await placeTestOrder()).json().id
      const productClient = mockProductClient()

      await withApp({ productClient }, async (ctx) => {
        await ctx.app.orderService.markAsCancelled(orderId)
        await ctx.app.orderService.markAsCancelled(orderId)

        expect(productClient.restoreOrderStockCalls).toHaveLength(1)
        expect(await statusChanges(ctx.db)).toHaveLength(1)
      })
    })

    it('should rethrow and keep the order pending when restore fails', async () => {
      const orderId = (await placeTestOrder()).json().id
      const productClient = mockProductClient()
      productClient.restoreOrderStock = async () => {
        throw new Error('product-service down')
      }

      await withApp({ productClient }, async (ctx) => {
        await expect(
          ctx.app.orderService.markAsCancelled(orderId),
        ).rejects.toThrow('product-service down')

        expect(await orderStatus(orderId)).toBe('pending')
        expect(await statusChanges(ctx.db)).toHaveLength(0)
      })
    })

    it('should not let a concurrent payment confirmation win after stock is restored', async () => {
      const orderId = (await placeTestOrder()).json().id
      const productClient = mockProductClient()

      await withApp({ productClient }, async (ctx) => {
        let paid: Promise<void> | undefined
        productClient.restoreOrderStock = async () => {
          paid = ctx.app.orderService.markAsPaid(orderId)
          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        await ctx.app.orderService.markAsCancelled(orderId)
        await paid

        expect(await orderStatus(orderId)).toBe('cancelled')
        expect(await statusChanges(ctx.db)).toEqual([
          expect.objectContaining({
            data: expect.objectContaining({ status: 'cancelled' }),
          }),
        ])
      })
    })

    it('should do nothing when order is not pending', async () => {
      const orderId = (await placeTestOrder()).json().id
      await setStatus(orderId, 'paid')
      const before = await statusChanges()
      const productClient = mockProductClient()

      await withApp({ productClient }, async (ctx) => {
        await ctx.app.orderService.markAsCancelled(orderId)

        expect(productClient.restoreOrderStockCalls).toHaveLength(0)
        expect(await orderStatus(orderId)).toBe('paid')
        expect(await statusChanges(ctx.db)).toEqual(before)
      })
    })
  })

  describe('PATCH /orders/:id/status to cancelled', () => {
    it.each(['pending', 'paid'] as const)(
      'should restore stock when cancelling a %s order',
      async (from) => {
        const productClient = mockProductClient()

        await withApp({ productClient }, async (ctx) => {
          const orderId = (await placeTestOrder(undefined, ctx.app)).json().id
          if (from === 'paid') await setStatus(orderId, 'paid', ctx.app)

          const res = await setStatus(orderId, 'cancelled', ctx.app)

          expect(res.statusCode).toBe(200)
          expect(res.json().status).toBe('cancelled')
          expect(productClient.restoreOrderStockCalls).toEqual([
            { orderId, items: ORDER_ITEMS },
          ])
        })
      },
    )

    it('should not restore stock for an invalid transition', async () => {
      const productClient = mockProductClient()

      await withApp({ productClient }, async (ctx) => {
        const orderId = (await placeTestOrder(undefined, ctx.app)).json().id
        await setStatus(orderId, 'paid', ctx.app)
        await setStatus(orderId, 'shipped', ctx.app)

        const res = await setStatus(orderId, 'cancelled', ctx.app)

        expect(res.statusCode).toBe(409)
        expect(productClient.restoreOrderStockCalls).toHaveLength(0)
      })
    })

    it('should fail and keep the order unchanged when restore fails', async () => {
      const productClient = mockProductClient()
      productClient.restoreOrderStock = async () => {
        throw new Error('product-service down')
      }

      await withApp({ productClient }, async (ctx) => {
        const orderId = (await placeTestOrder(undefined, ctx.app)).json().id

        const res = await setStatus(orderId, 'cancelled', ctx.app)

        expect(res.statusCode).toBe(500)
        expect(await orderStatus(orderId)).toBe('pending')
        expect(await statusChanges(ctx.db)).toHaveLength(0)
      })
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

    it('should enqueue order.status-changed event', async () => {
      const createRes = await placeTestOrder()
      const orderId = createRes.json().id

      await app.inject({
        method: 'PATCH',
        url: `/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { status: 'paid' },
      })

      // Recipient is the order's customer, not the admin who changed it
      expect(await statusChanges()).toEqual([
        {
          topic: 'order.status-changed',
          key: orderId,
          data: {
            orderId,
            userId: DEFAULT_USER_ID,
            email: DEFAULT_USER_EMAIL,
            status: 'paid',
          },
        },
      ])
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

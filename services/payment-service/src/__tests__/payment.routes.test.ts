import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { payments } from '../db/schema.js'
import {
  adminToken,
  cleanDb,
  createTestApp,
  DEFAULT_USER_ID,
  OTHER_USER_ID,
  userToken,
} from './helpers.js'

describe('payment routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterEach(async () => {
    await cleanDb(ctx.db)
  })

  afterAll(async () => {
    await ctx.app.close()
    await ctx.pool.end()
  })

  async function seedPayment() {
    const [row] = await ctx.db
      .insert(payments)
      .values({
        orderId: crypto.randomUUID(),
        userId: DEFAULT_USER_ID,
        userEmail: 'user@test.com',
        amount: 3000,
        status: 'confirmed',
        provider: 'stripe',
        providerPaymentId: 'pi_seed',
      })
      .returning()
    return row
  }

  function getPayment(orderId: string, token?: string) {
    return ctx.app.inject({
      method: 'GET',
      url: `/payments/order/${orderId}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
  }

  describe('GET /payments/order/:orderId', () => {
    it('returns the payment to its owner', async () => {
      const payment = await seedPayment()

      const res = await getPayment(payment.orderId, userToken(ctx.app))

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe(payment.id)
      expect(body.status).toBe('confirmed')
      expect(body.amount).toBe(3000)
    })

    it('returns any payment to an admin', async () => {
      const payment = await seedPayment()

      const res = await getPayment(payment.orderId, adminToken(ctx.app))

      expect(res.statusCode).toBe(200)
      expect(res.json().id).toBe(payment.id)
    })

    it('returns 403 to another user', async () => {
      const payment = await seedPayment()

      const res = await getPayment(
        payment.orderId,
        userToken(ctx.app, OTHER_USER_ID),
      )

      expect(res.statusCode).toBe(403)
    })

    it('returns 404 PAYMENT_NOT_FOUND when the order has no payment yet', async () => {
      const res = await getPayment(crypto.randomUUID(), userToken(ctx.app))

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toBe('PAYMENT_NOT_FOUND')
    })

    it('returns 400 for a non-uuid orderId', async () => {
      const res = await getPayment('not-a-uuid', userToken(ctx.app))

      expect(res.statusCode).toBe(400)
    })

    it('returns 401 without auth', async () => {
      const payment = await seedPayment()

      const res = await getPayment(payment.orderId)

      expect(res.statusCode).toBe(401)
    })
  })
})

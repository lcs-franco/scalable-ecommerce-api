import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { payments } from '../db/schema.js'
import { cleanDb, createTestApp, orderPlacedEvent } from './helpers.js'

describe('paymentService.processOrderPlaced', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterEach(async () => {
    await cleanDb(ctx.db)
    ctx.publishers.events.length = 0
    ctx.fake.calls.length = 0
    ctx.fake.willReturn({ success: true, providerPaymentId: 'pi_fake_1' })
  })

  afterAll(async () => {
    await ctx.app.close()
    await ctx.pool.end()
  })

  async function findPayment(orderId: string) {
    const [row] = await ctx.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
    return row
  }

  it('confirms the payment and publishes payment.confirmed on success', async () => {
    const event = orderPlacedEvent()

    await ctx.app.paymentService.processOrderPlaced(event)

    const row = await findPayment(event.orderId)
    expect(row.status).toBe('confirmed')
    expect(row.amount).toBe(3000)
    expect(row.userId).toBe(event.userId)
    expect(row.provider).toBe('stripe')
    expect(row.providerPaymentId).toBe('pi_fake_1')
    expect(row.failureReason).toBeNull()

    expect(ctx.publishers.events).toEqual([
      {
        topic: 'payment.confirmed',
        data: {
          orderId: event.orderId,
          paymentId: row.id,
          amount: 3000,
          provider: 'stripe',
        },
      },
    ])
  })

  it('calls the processor with amount, usd, the order idempotency key and metadata', async () => {
    const event = orderPlacedEvent()

    await ctx.app.paymentService.processOrderPlaced(event)

    expect(ctx.fake.calls).toEqual([
      {
        amount: 3000,
        currency: 'usd',
        idempotencyKey: `order-${event.orderId}`,
        metadata: { orderId: event.orderId, userId: event.userId },
      },
    ])
  })

  it('marks the payment failed and publishes payment.failed on failure', async () => {
    ctx.fake.willReturn({
      success: false,
      reason: 'Your card was declined.',
      providerPaymentId: 'pi_declined',
    })
    const event = orderPlacedEvent()

    await ctx.app.paymentService.processOrderPlaced(event)

    const row = await findPayment(event.orderId)
    expect(row.status).toBe('failed')
    expect(row.failureReason).toBe('Your card was declined.')
    expect(row.providerPaymentId).toBe('pi_declined')

    expect(ctx.publishers.events).toEqual([
      {
        topic: 'payment.failed',
        data: {
          orderId: event.orderId,
          paymentId: row.id,
          reason: 'Your card was declined.',
        },
      },
    ])
  })

  it('re-publishes the stored outcome without charging again on a terminal redelivery', async () => {
    const event = orderPlacedEvent()
    await ctx.app.paymentService.processOrderPlaced(event)
    const first = ctx.publishers.events[0]

    // A later processor result must not leak into the redelivery
    ctx.fake.willReturn({ success: false, reason: 'should not be used' })
    await ctx.app.paymentService.processOrderPlaced(event)

    expect(ctx.fake.calls).toHaveLength(1)
    expect(ctx.publishers.events).toEqual([first, first])
    expect((await findPayment(event.orderId)).status).toBe('confirmed')
  })

  it('reprocesses a pending row left over by a crash', async () => {
    const event = orderPlacedEvent()
    const [leftover] = await ctx.db
      .insert(payments)
      .values({
        orderId: event.orderId,
        userId: event.userId,
        amount: event.total,
      })
      .returning()

    await ctx.app.paymentService.processOrderPlaced(event)

    const row = await findPayment(event.orderId)
    expect(row.id).toBe(leftover.id)
    expect(row.status).toBe('confirmed')
    expect(ctx.fake.calls).toHaveLength(1)
    expect(ctx.publishers.events).toHaveLength(1)
  })
})

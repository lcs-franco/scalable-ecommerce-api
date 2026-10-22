import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { payments } from '../db/schema.js'
import {
  cleanDb,
  createTestApp,
  orderPlacedEvent,
  outboxEvents,
} from './helpers.js'

describe('paymentService.processOrderPlaced', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterEach(async () => {
    await cleanDb(ctx.db)
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

  async function insertPendingPayment(
    event: ReturnType<typeof orderPlacedEvent>,
  ) {
    const [row] = await ctx.db
      .insert(payments)
      .values({
        orderId: event.orderId,
        userId: event.userId,
        userEmail: event.email,
        amount: event.total,
      })
      .returning()

    return row
  }

  it('confirms the payment and enqueues payment.confirmed on success', async () => {
    const event = orderPlacedEvent()

    await ctx.app.paymentService.processOrderPlaced(event)

    const row = await findPayment(event.orderId)
    expect(row.status).toBe('confirmed')
    expect(row.amount).toBe(3000)
    expect(row.userId).toBe(event.userId)
    expect(row.userEmail).toBe(event.email)
    expect(row.provider).toBe('stripe')
    expect(row.providerPaymentId).toBe('pi_fake_1')
    expect(row.failureReason).toBeNull()

    expect(await outboxEvents(ctx.db)).toEqual([
      {
        topic: 'payment.confirmed',
        key: row.id,
        data: {
          orderId: event.orderId,
          paymentId: row.id,
          userId: event.userId,
          email: event.email,
          amount: 3000,
          provider: 'stripe',
        },
      },
    ])
  })

  it("calls the processor with amount, usd, the event's payment method, the order idempotency key and metadata", async () => {
    const event = orderPlacedEvent({ paymentMethodId: 'pm_card_mastercard' })

    await ctx.app.paymentService.processOrderPlaced(event)

    expect(ctx.fake.calls).toEqual([
      {
        amount: 3000,
        currency: 'usd',
        paymentMethod: 'pm_card_mastercard',
        idempotencyKey: `order-${event.orderId}`,
        metadata: { orderId: event.orderId, userId: event.userId },
      },
    ])
  })

  it('marks the payment failed and enqueues payment.failed on failure', async () => {
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

    expect(await outboxEvents(ctx.db)).toEqual([
      {
        topic: 'payment.failed',
        key: row.id,
        data: {
          orderId: event.orderId,
          paymentId: row.id,
          userId: event.userId,
          email: event.email,
          reason: 'Your card was declined.',
        },
      },
    ])
  })

  it('enqueues no second event and does not charge again on a terminal redelivery', async () => {
    const event = orderPlacedEvent()
    await ctx.app.paymentService.processOrderPlaced(event)
    const first = await outboxEvents(ctx.db)

    ctx.fake.willReturn({ success: false, reason: 'should not be used' })
    await ctx.app.paymentService.processOrderPlaced(event)

    expect(ctx.fake.calls).toHaveLength(1)
    expect(await outboxEvents(ctx.db)).toEqual(first)
    expect((await findPayment(event.orderId)).status).toBe('confirmed')
  })

  it('enqueues nothing when another consumer already finished the payment', async () => {
    const event = orderPlacedEvent()
    const leftover = await insertPendingPayment(event)

    const original = ctx.fake.processor.processPayment
    ctx.fake.processor.processPayment = async () => {
      await ctx.db
        .update(payments)
        .set({ status: 'failed', failureReason: 'other consumer' })
        .where(eq(payments.id, leftover.id))

      return { success: true, providerPaymentId: 'pi_late' }
    }

    try {
      await ctx.app.paymentService.processOrderPlaced(event)
    } finally {
      ctx.fake.processor.processPayment = original
    }

    expect(await outboxEvents(ctx.db)).toEqual([])
    expect((await findPayment(event.orderId)).failureReason).toBe(
      'other consumer',
    )
  })

  it('reprocesses a pending row left over by a crash', async () => {
    const event = orderPlacedEvent()
    const leftover = await insertPendingPayment(event)

    await ctx.app.paymentService.processOrderPlaced(event)

    const row = await findPayment(event.orderId)
    expect(row.id).toBe(leftover.id)
    expect(row.status).toBe('confirmed')
    expect(ctx.fake.calls).toHaveLength(1)
    expect(await outboxEvents(ctx.db)).toHaveLength(1)
  })
})

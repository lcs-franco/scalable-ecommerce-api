import type { EventData, Topics } from '@ecommerce/events'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { type Payment, payments } from '../db/schema.js'
import { PaymentNotFound } from '../errors/index.js'
import type { IPaymentProcessor } from '../payments/payment-processor.js'

const CURRENCY = 'usd'

type OrderPlaced = EventData<typeof Topics.ORDER_PLACED>

export interface IPaymentPublishers {
  publishPaymentConfirmed: (
    data: EventData<typeof Topics.PAYMENT_CONFIRMED>,
  ) => Promise<void>
  publishPaymentFailed: (
    data: EventData<typeof Topics.PAYMENT_FAILED>,
  ) => Promise<void>
}

interface IDeps extends IPaymentPublishers {
  db: Db
  processor: IPaymentProcessor
}

export function createPaymentService(deps: IDeps) {
  const { db, processor, publishPaymentConfirmed, publishPaymentFailed } = deps

  async function findByOrderId(orderId: string) {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
    if (!payment) throw new PaymentNotFound()
    return payment
  }

  // Publishes the event matching a terminal row. Used both after processing
  // and when a redelivered event finds an already-terminal payment.
  async function publishOutcome(payment: Payment) {
    if (payment.status === 'confirmed') {
      await publishPaymentConfirmed({
        orderId: payment.orderId,
        paymentId: payment.id,
        amount: payment.amount,
        provider: payment.provider ?? processor.name,
      })
      return
    }
    if (payment.status === 'failed') {
      await publishPaymentFailed({
        orderId: payment.orderId,
        paymentId: payment.id,
        reason: payment.failureReason ?? 'unknown',
      })
    }
  }

  async function processOrderPlaced(event: OrderPlaced) {
    const [inserted] = await db
      .insert(payments)
      .values({
        userId: event.userId,
        orderId: event.orderId,
        amount: event.total,
      })
      .onConflictDoNothing({ target: payments.orderId })
      .returning()

    const payment =
      inserted ??
      (
        await db
          .select()
          .from(payments)
          .where(eq(payments.orderId, event.orderId))
      )[0]

    if (payment.status === 'confirmed' || payment.status === 'failed') {
      await publishOutcome(payment)

      return
    }

    const paymentResult = await processor.processPayment({
      amount: payment.amount,
      currency: CURRENCY,
      idempotencyKey: `order-${payment.orderId}`,
      metadata: { orderId: payment.orderId, userId: payment.userId },
    })

    const result = paymentResult.success
      ? {
          status: 'confirmed' as const,
          providerPaymentId: paymentResult.providerPaymentId,
          failureReason: null,
        }
      : {
          status: 'failed' as const,
          providerPaymentId: paymentResult.providerPaymentId ?? null,
          failureReason: paymentResult.reason,
        }

    const [updatedPayment] = await db
      .update(payments)
      .set({ ...result, provider: processor.name })
      .where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')))
      .returning()

    const updated =
      updatedPayment ??
      (await db.select().from(payments).where(eq(payments.id, payment.id)))[0]

    await publishOutcome(updated)
  }

  return { processOrderPlaced, findByOrderId }
}

export type PaymentService = ReturnType<typeof createPaymentService>

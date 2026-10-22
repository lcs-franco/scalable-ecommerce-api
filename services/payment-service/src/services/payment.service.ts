import { type EventData, Topics } from '@ecommerce/events'
import { enqueue, type OutboxDb } from '@ecommerce/events/outbox'
import { and, eq, type SQL } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { type Payment, payments } from '../db/schema.js'
import { PaymentNotFound } from '../errors/index.js'
import type {
  IPaymentProcessor,
  PaymentResult,
} from '../payments/payment-processor.js'

const CURRENCY = 'usd'

type OrderPlaced = EventData<typeof Topics.ORDER_PLACED>

interface IDeps {
  db: Db
  processor: IPaymentProcessor
}

// Maps what the provider returned to the columns of the terminal row.
function toOutcomeUpdate(providerResult: PaymentResult) {
  return providerResult.success
    ? {
        status: 'confirmed' as const,
        providerPaymentId: providerResult.providerPaymentId,
        failureReason: null,
      }
    : {
        status: 'failed' as const,
        providerPaymentId: providerResult.providerPaymentId ?? null,
        failureReason: providerResult.reason,
      }
}

export function createPaymentService(deps: IDeps) {
  const { db, processor } = deps

  async function selectPayment(where: SQL) {
    const [payment] = await db.select().from(payments).where(where)

    return payment
  }

  async function findByOrderId(orderId: string) {
    const payment = await selectPayment(eq(payments.orderId, orderId))
    if (!payment) throw new PaymentNotFound()

    return payment
  }

  async function enqueueOutcome(tx: OutboxDb, payment: Payment) {
    const base = {
      orderId: payment.orderId,
      paymentId: payment.id,
      userId: payment.userId,
      email: payment.userEmail,
    }

    if (payment.status === 'confirmed') {
      await enqueue(
        tx,
        Topics.PAYMENT_CONFIRMED,
        {
          ...base,
          amount: payment.amount,
          provider: payment.provider ?? processor.name,
        },
        { key: payment.id },
      )
    } else if (payment.status === 'failed') {
      await enqueue(
        tx,
        Topics.PAYMENT_FAILED,
        { ...base, reason: payment.failureReason ?? 'unknown' },
        { key: payment.id },
      )
    }
  }

  async function processOrderPlaced(event: OrderPlaced) {
    const [inserted] = await db
      .insert(payments)
      .values({
        userId: event.userId,
        userEmail: event.email,
        orderId: event.orderId,
        amount: event.total,
      })
      .onConflictDoNothing({ target: payments.orderId })
      .returning()

    const payment =
      inserted ?? (await selectPayment(eq(payments.orderId, event.orderId)))

    // Already terminal: its event was enqueued with the status update.
    if (payment.status !== 'pending') return

    const providerResult = await processor.processPayment({
      amount: payment.amount,
      currency: CURRENCY,
      paymentMethod: event.paymentMethodId,
      idempotencyKey: `order-${payment.orderId}`,
      metadata: { orderId: payment.orderId, userId: payment.userId },
    })

    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(payments)
        .set({ ...toOutcomeUpdate(providerResult), provider: processor.name })
        .where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')))
        .returning()

      // 0 rows updated: another consumer finished first and enqueued its outcome.
      if (updated) await enqueueOutcome(tx, updated)
    })
  }

  return { processOrderPlaced, findByOrderId }
}

export type PaymentService = ReturnType<typeof createPaymentService>

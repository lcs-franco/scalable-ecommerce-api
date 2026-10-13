import type { EventData, Topics } from '@ecommerce/events'
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
  const { db, processor, publishPaymentConfirmed, publishPaymentFailed } = deps

  async function selectPayment(where: SQL) {
    const [payment] = await db.select().from(payments).where(where)
    return payment
  }

  async function findByOrderId(orderId: string) {
    const payment = await selectPayment(eq(payments.orderId, orderId))
    if (!payment) throw new PaymentNotFound()
    return payment
  }

  // Publishes the event matching a terminal row. Used both after processing
  // and when a redelivered event finds an already-terminal payment.
  async function publishOutcome(payment: Payment) {
    const recipient = { userId: payment.userId, email: payment.userEmail }
    if (payment.status === 'confirmed') {
      await publishPaymentConfirmed({
        orderId: payment.orderId,
        paymentId: payment.id,
        ...recipient,
        amount: payment.amount,
        provider: payment.provider ?? processor.name,
      })
    } else if (payment.status === 'failed') {
      await publishPaymentFailed({
        orderId: payment.orderId,
        paymentId: payment.id,
        ...recipient,
        reason: payment.failureReason ?? 'unknown',
      })
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

    if (payment.status !== 'pending') {
      await publishOutcome(payment)
      return
    }

    const providerResult = await processor.processPayment({
      amount: payment.amount,
      currency: CURRENCY,
      idempotencyKey: `order-${payment.orderId}`,
      metadata: { orderId: payment.orderId, userId: payment.userId },
    })

    const [updated] = await db
      .update(payments)
      .set({ ...toOutcomeUpdate(providerResult), provider: processor.name })
      .where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')))
      .returning()

    // 0 rows updated: another consumer finished first, publish its outcome.
    await publishOutcome(
      updated ?? (await selectPayment(eq(payments.id, payment.id))),
    )
  }

  return { processOrderPlaced, findByOrderId }
}

export type PaymentService = ReturnType<typeof createPaymentService>

import { beforeEach, describe, expect, it } from 'vitest'
import { createNotificationService } from '../services/notification.service.js'
import {
  EMAIL,
  fakeEmailProvider,
  fakeLogger,
  ORDER_ID,
  PAYMENT_ID,
  PRODUCT_ID,
  USER_ID,
} from './helpers.js'

describe('NotificationService', () => {
  let email: ReturnType<typeof fakeEmailProvider>
  let log: ReturnType<typeof fakeLogger>
  let service: ReturnType<typeof createNotificationService>

  beforeEach(() => {
    email = fakeEmailProvider()
    log = fakeLogger()
    service = createNotificationService({ email: email.provider, log })
  })

  it('sends a welcome email on user.registered', async () => {
    await service.onUserRegistered({
      userId: USER_ID,
      email: EMAIL,
      name: 'Ana',
    })

    expect(email.sent).toHaveLength(1)
    expect(email.sent[0].to).toBe(EMAIL)
    expect(email.sent[0].html).toContain('Ana')
  })

  it('sends an order confirmation on order.placed', async () => {
    await service.onOrderPlaced({
      orderId: ORDER_ID,
      userId: USER_ID,
      email: EMAIL,
      items: [
        { productId: PRODUCT_ID, name: 'Mouse', quantity: 1, price: 2500 },
      ],
      total: 2500,
    })

    expect(email.sent).toHaveLength(1)
    expect(email.sent[0].to).toBe(EMAIL)
    expect(email.sent[0].html).toContain('$25.00')
  })

  it('sends a payment success email on payment.confirmed', async () => {
    await service.onPaymentConfirmed({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      userId: USER_ID,
      email: EMAIL,
      amount: 2500,
      provider: 'stripe',
    })

    expect(email.sent).toHaveLength(1)
    expect(email.sent[0].subject).toContain('Payment received')
  })

  it('sends a payment failure email on payment.failed', async () => {
    await service.onPaymentFailed({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      userId: USER_ID,
      email: EMAIL,
      reason: 'Your card was declined.',
    })

    expect(email.sent).toHaveLength(1)
    expect(email.sent[0].html).toContain('Your card was declined.')
  })

  it.each(['shipped', 'delivered'] as const)(
    'sends a status email when the order is %s',
    async (status) => {
      await service.onOrderStatusChanged({
        orderId: ORDER_ID,
        userId: USER_ID,
        email: EMAIL,
        status,
      })

      expect(email.sent).toHaveLength(1)
    },
  )

  it.each(['pending', 'paid', 'cancelled'] as const)(
    'skips the status email when the order is %s',
    async (status) => {
      await service.onOrderStatusChanged({
        orderId: ORDER_ID,
        userId: USER_ID,
        email: EMAIL,
        status,
      })

      expect(email.sent).toHaveLength(0)
    },
  )

  it('logs a failed send with the event context and does not rethrow', async () => {
    const error = new Error('SMTP down')
    email.failWith(error)

    await expect(
      service.onPaymentFailed({
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        userId: USER_ID,
        email: EMAIL,
        reason: 'Your card was declined.',
      }),
    ).resolves.toBeUndefined()

    expect(log.error).toHaveBeenCalledOnce()
    expect(log.error.mock.calls[0][0]).toMatchObject({
      err: error,
      topic: 'payment.failed',
      userId: USER_ID,
      orderId: ORDER_ID,
    })
  })
})

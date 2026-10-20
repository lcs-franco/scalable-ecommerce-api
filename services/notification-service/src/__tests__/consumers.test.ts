import { randomUUID } from 'node:crypto'
import { createProducer, EVENT_ID_HEADER, Topics } from '@ecommerce/events'
import { createTestConsumer, testKafka } from '@ecommerce/events/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  orderConfirmationEmail,
  orderStatusEmail,
  paymentConfirmedEmail,
  paymentFailedEmail,
  welcomeEmail,
} from '../emails/index.js'
import { setupConsumers } from '../kafka/consumers.js'
import { createNotificationService } from '../services/notification.service.js'
import {
  cleanRedis,
  fakeEmailProvider,
  fakeLogger,
  ORDER_ID,
  PAYMENT_ID,
  PRODUCT_ID,
  testDeduper,
  testRedis,
} from './helpers.js'

function orderPlaced(email: string) {
  return {
    userId: randomUUID(),
    email,
    orderId: ORDER_ID,
    items: [{ productId: PRODUCT_ID, name: 'Mouse', quantity: 1, price: 2500 }],
    total: 2500,
    paymentMethodId: 'pm_card_visa',
  }
}

describe('setupConsumers on the broker', () => {
  const kafka = testKafka()
  const producer = createProducer(kafka)
  const email = fakeEmailProvider()
  const redis = testRedis()
  let consumer: Awaited<ReturnType<typeof createTestConsumer>>

  beforeAll(async () => {
    await producer.connect()
    consumer = await createTestConsumer(kafka)
    await setupConsumers({
      consumer,
      notificationService: createNotificationService({
        email: email.provider,
        log: fakeLogger(),
      }),
      deduper: testDeduper(redis),
    })
  })

  afterAll(async () => {
    await consumer.disconnect()
    await producer.disconnect()
    await cleanRedis(redis)
    await redis.quit()
  })

  const sentTo = (to: string) => email.sent.filter((m) => m.to === to)

  it('sends the email of each topic', async () => {
    const recipient = {
      userId: randomUUID(),
      email: `${randomUUID()}@test.com`,
    }
    const registered = { ...recipient, name: 'Ana' }
    const placed = {
      ...recipient,
      orderId: ORDER_ID,
      items: [
        { productId: PRODUCT_ID, name: 'Mouse', quantity: 1, price: 2500 },
      ],
      total: 2500,
      paymentMethodId: 'pm_card_visa',
    }
    const confirmed = {
      ...recipient,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      amount: 2500,
      provider: 'stripe',
    }
    const failed = {
      ...recipient,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      reason: 'Your card was declined.',
    }
    const shipped = {
      ...recipient,
      orderId: ORDER_ID,
      status: 'shipped' as const,
    }

    await producer.publish(Topics.USER_REGISTERED, registered)
    await producer.publish(Topics.ORDER_PLACED, placed)
    await producer.publish(Topics.PAYMENT_CONFIRMED, confirmed)
    await producer.publish(Topics.PAYMENT_FAILED, failed)
    await producer.publish(Topics.ORDER_STATUS_CHANGED, shipped)

    const expected = await Promise.all([
      welcomeEmail(registered),
      orderConfirmationEmail(placed),
      paymentConfirmedEmail(confirmed),
      paymentFailedEmail(failed),
      orderStatusEmail(shipped),
    ])
    const subjects = () =>
      email.sent.filter((m) => m.to === recipient.email).map((m) => m.subject)
    await vi.waitFor(() => expect(subjects()).toHaveLength(5), {
      timeout: 10_000,
    })
    expect(subjects().sort()).toEqual(expected.map((e) => e.subject).sort())
  })

  it('sends one email for an event delivered twice with the same event-id', async () => {
    const key = randomUUID()
    const eventId = randomUUID()
    const placed = orderPlaced(`${randomUUID()}@test.com`)
    const sentinel = orderPlaced(`${randomUUID()}@test.com`)

    await producer.publish(Topics.ORDER_PLACED, placed, {
      key,
      headers: { [EVENT_ID_HEADER]: eventId },
    })
    await producer.publish(Topics.ORDER_PLACED, placed, {
      key,
      headers: { [EVENT_ID_HEADER]: eventId },
    })
    // Same key, same partition: once it is sent, the duplicate was already consumed.
    await producer.publish(Topics.ORDER_PLACED, sentinel, {
      key,
      headers: { [EVENT_ID_HEADER]: randomUUID() },
    })

    await vi.waitFor(() => expect(sentTo(sentinel.email)).toHaveLength(1), {
      timeout: 10_000,
    })
    expect(sentTo(placed.email)).toHaveLength(1)
  })

  it('sends every delivery of an event without event-id', async () => {
    const key = randomUUID()
    const placed = orderPlaced(`${randomUUID()}@test.com`)

    await producer.publish(Topics.ORDER_PLACED, placed, { key })
    await producer.publish(Topics.ORDER_PLACED, placed, { key })

    await vi.waitFor(() => expect(sentTo(placed.email)).toHaveLength(2), {
      timeout: 10_000,
    })
  })
})

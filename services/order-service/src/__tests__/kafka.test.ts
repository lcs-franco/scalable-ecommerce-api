import { createProducer, Topics } from '@ecommerce/events'
import {
  collectEvents,
  createTestConsumer,
  testKafka,
} from '@ecommerce/events/testing'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { setupConsumers } from '../kafka/consumers.js'
import { createPublishers } from '../kafka/publishers.js'
import {
  adminToken,
  cleanDb,
  createTestApp,
  DEFAULT_USER_EMAIL,
  DEFAULT_USER_ID,
  userToken,
} from './helpers.js'

const WAIT = { timeout: 10_000 }

describe('order-service on the broker', () => {
  const kafka = testKafka()
  const producer = createProducer(kafka)
  let ctx: Awaited<ReturnType<typeof createTestApp>>
  let consumer: Awaited<ReturnType<typeof createTestConsumer>>

  beforeAll(async () => {
    await producer.connect()
    ctx = await createTestApp({ publishers: createPublishers(producer) })
    consumer = await createTestConsumer(kafka)
    await setupConsumers({
      consumer,
      orderService: ctx.orderService,
      log: ctx.app.log,
    })
  })

  afterEach(async () => {
    await cleanDb(ctx.db)
  })

  afterAll(async () => {
    await consumer.disconnect()
    await producer.disconnect()
    await ctx.app.close()
    await ctx.pool.end()
  })

  async function placeOrder(): Promise<string> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${userToken(ctx.app)}` },
      payload: { paymentMethodId: 'pm_card_visa' },
    })
    return res.json().id
  }

  async function orderStatus(orderId: string) {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/orders/${orderId}`,
      headers: { authorization: `Bearer ${adminToken(ctx.app)}` },
    })
    return res.json().status
  }

  const recipient = { userId: DEFAULT_USER_ID, email: DEFAULT_USER_EMAIL }

  it('publishes order.placed when an order is placed', async () => {
    const placed = await collectEvents(kafka, Topics.ORDER_PLACED)

    const orderId = await placeOrder()

    await vi.waitFor(
      () =>
        expect(placed.events.find((e) => e.orderId === orderId)).toMatchObject({
          ...recipient,
          total: 3000,
          paymentMethodId: 'pm_card_visa',
        }),
      WAIT,
    )
    await placed.stop()
  })

  it('marks the order paid on payment.confirmed', async () => {
    const statusChanged = await collectEvents(
      kafka,
      Topics.ORDER_STATUS_CHANGED,
    )
    const orderId = await placeOrder()

    await producer.publish(Topics.PAYMENT_CONFIRMED, {
      ...recipient,
      orderId,
      paymentId: crypto.randomUUID(),
      amount: 3000,
      provider: 'stripe',
    })

    await vi.waitFor(
      async () => expect(await orderStatus(orderId)).toBe('paid'),
      WAIT,
    )
    await vi.waitFor(
      () =>
        expect(statusChanged.events).toContainEqual({
          ...recipient,
          orderId,
          status: 'paid',
        }),
      WAIT,
    )
    await statusChanged.stop()
  })

  it('cancels the order on payment.failed', async () => {
    const orderId = await placeOrder()

    await producer.publish(Topics.PAYMENT_FAILED, {
      ...recipient,
      orderId,
      paymentId: crypto.randomUUID(),
      reason: 'Your card was declined.',
    })

    await vi.waitFor(
      async () => expect(await orderStatus(orderId)).toBe('cancelled'),
      WAIT,
    )
  })
})

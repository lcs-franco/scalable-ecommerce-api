import { createProducer, Topics } from '@ecommerce/events'
import {
  collectEvents,
  createTestConsumer,
  testKafka,
} from '@ecommerce/events/testing'
import { createLogger } from '@ecommerce/logger'
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
import { cleanDb, createTestApp, orderPlacedEvent } from './helpers.js'

const WAIT = { timeout: 10_000 }

describe('payment-service on the broker', () => {
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
      paymentService: ctx.app.paymentService,
      log: createLogger({ service: 'payment-service', level: 'silent' }),
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

  it('publishes payment.confirmed when the processor succeeds', async () => {
    const confirmed = await collectEvents(kafka, Topics.PAYMENT_CONFIRMED)
    ctx.fake.willReturn({ success: true, providerPaymentId: 'pi_ok' })
    const event = orderPlacedEvent()

    await producer.publish(Topics.ORDER_PLACED, event)

    await vi.waitFor(
      () =>
        expect(
          confirmed.events.find((e) => e.orderId === event.orderId),
        ).toMatchObject({ userId: event.userId, amount: event.total }),
      WAIT,
    )
    await confirmed.stop()
  })

  it('publishes payment.failed when the processor declines', async () => {
    const failed = await collectEvents(kafka, Topics.PAYMENT_FAILED)
    ctx.fake.willReturn({ success: false, reason: 'Your card was declined.' })
    const event = orderPlacedEvent()

    await producer.publish(Topics.ORDER_PLACED, event)

    await vi.waitFor(
      () =>
        expect(
          failed.events.find((e) => e.orderId === event.orderId),
        ).toMatchObject({ reason: 'Your card was declined.' }),
      WAIT,
    )
    await failed.stop()
  })
})

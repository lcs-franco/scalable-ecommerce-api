import { createDb } from '@ecommerce/db'
import { createConsumer, createKafka, createProducer } from '@ecommerce/events'
import { createOutboxRelay, outboxBacklog } from '@ecommerce/events/outbox'
import type { Logger } from '@ecommerce/logger'
import {
  consumerMetrics,
  observeOutbox,
  observePgPool,
} from '@ecommerce/metrics'
import { runService } from '@ecommerce/service'
import Stripe from 'stripe'
import { buildApp } from './app.js'
import { config } from './config/env.js'
import * as schema from './db/schema.js'
import { setupConsumers } from './kafka/consumers.js'
import { createFakeProcessor } from './payments/fake.processor.js'
import type { IPaymentProcessor } from './payments/payment-processor.js'
import { createStripeProcessor } from './payments/stripe.processor.js'

function createProcessor(log: Logger): IPaymentProcessor {
  if (config.PAYMENT_PROCESSOR === 'stripe') {
    log.info('Payment processor: stripe (test mode)')

    return createStripeProcessor({
      stripe: new Stripe(config.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 }),
      log,
    })
  }

  const knobs = {
    latencyMs: config.FAKE_PAYMENT_LATENCY_MS,
    jitterMs: config.FAKE_PAYMENT_JITTER_MS,
    failureRate: config.FAKE_PAYMENT_FAILURE_RATE,
  }

  log.warn(knobs, 'Payment processor: fake, no real charges')

  return createFakeProcessor(knobs)
}

const name = 'payment-service'

await runService({ name, config }, async ({ log, onClose, afterListen }) => {
  const { db, pool } = createDb({ url: config.DATABASE_URL, schema })

  onClose('postgres', () => pool.end())
  observePgPool(pool)
  observeOutbox(() => outboxBacklog(db))

  const kafka = createKafka({ service: name, broker: config.KAFKA_BROKER, log })
  const producer = createProducer(kafka)

  onClose('kafka producer', () => producer.disconnect())
  await producer.connect()

  const consumer = createConsumer(kafka, name, log, {
    onProcessed: consumerMetrics(),
  })

  onClose('kafka consumer', () => consumer.disconnect())
  await consumer.connect()

  const app = await buildApp({
    db,
    logger: log,
    processor: createProcessor(log),
  })

  const relay = createOutboxRelay({ db, producer, log })

  afterListen(() => relay.start())
  onClose('outbox relay', () => relay.stop())

  await setupConsumers({ consumer, paymentService: app.paymentService, log })

  return app
})

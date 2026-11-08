/* eslint-disable no-console */
import {
  createConsumer,
  createKafkaLogCreator,
  createProducer,
} from '@ecommerce/events'
import { createOutboxRelay, outboxBacklog } from '@ecommerce/events/outbox'
import { createLogger } from '@ecommerce/logger'
import {
  consumerMetrics,
  observeOutbox,
  observePgPool,
  startMetricsServer,
} from '@ecommerce/metrics'
import { Kafka, logLevel } from 'kafkajs'
import Stripe from 'stripe'
import { buildApp } from './app.js'
import { config } from './config/env.js'
import { createDb } from './db/index.js'
import { setupConsumers } from './kafka/consumers.js'
import { createStripeProcessor } from './payments/stripe.processor.js'

async function main() {
  const log = createLogger({
    service: 'payment-service',
    level: config.LOG_LEVEL,
  })

  const { db, pool } = createDb(config.DATABASE_URL)

  observePgPool(pool)
  observeOutbox(() => outboxBacklog(db))

  const kafka = new Kafka({
    clientId: 'payment-service',
    brokers: [config.KAFKA_BROKER],
    logCreator: createKafkaLogCreator(log),
    logLevel: logLevel.DEBUG,
  })

  const producer = createProducer(kafka)

  await producer.connect()

  const consumer = createConsumer(kafka, 'payment-service', log, {
    onProcessed: consumerMetrics(),
  })

  await consumer.connect()

  const processor = createStripeProcessor({
    stripe: new Stripe(config.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 }),
    log,
  })

  log.info(`Payment processor: ${processor.name} (test mode)`)

  const app = await buildApp({ db, logger: log, processor })

  const relay = createOutboxRelay({ db, producer, log })

  await setupConsumers({
    consumer,
    paymentService: app.paymentService,
    log,
  })

  const metrics = await startMetricsServer({
    port: config.METRICS_PORT,
    service: 'payment-service',
  })

  const shutdown = async () => {
    await app.close()
    await metrics.close()
    await relay.stop()
    await consumer.disconnect()
    await producer.disconnect()
    await pool.end()
  }

  const onSignal = () => {
    shutdown().catch((err) => {
      log.error({ err }, 'shutdown failed')
      process.exit(1)
    })
  }

  process.on('SIGTERM', onSignal)
  process.on('SIGINT', onSignal)

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  relay.start()
  console.log('App running on port:', config.PORT)
}

main().catch((err) => {
  console.error('failed to start payment-service', err)
  process.exit(1)
})

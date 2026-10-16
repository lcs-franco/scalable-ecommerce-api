/* eslint-disable no-console */
import { createConsumer, createProducer } from '@ecommerce/events'
import { createLogger } from '@ecommerce/logger'
import { Kafka } from 'kafkajs'
import Stripe from 'stripe'
import { buildApp } from './app.js'
import { config } from './config/env.js'
import { createDb } from './db/index.js'
import { setupConsumers } from './kafka/consumers.js'
import { createPublishers } from './kafka/publishers.js'
import { createStripeProcessor } from './payments/stripe.processor.js'

async function main() {
  const log = createLogger({ service: 'payment-service' })
  const { db, pool } = createDb(config.DATABASE_URL)

  const kafka = new Kafka({
    clientId: 'payment-service',
    brokers: [config.KAFKA_BROKER],
  })

  const producer = createProducer(kafka)
  await producer.connect()

  const consumer = createConsumer(kafka, 'payment-service')
  await consumer.connect()

  const processor = createStripeProcessor({
    stripe: new Stripe(config.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 }),
    paymentMethod: config.STRIPE_TEST_PAYMENT_METHOD,
    log,
  })
  log.info(`Payment processor: ${processor.name} (test mode)`)

  const app = await buildApp({
    db,
    processor,
    publishers: createPublishers(producer),
  })

  await setupConsumers({
    consumer,
    paymentService: app.paymentService,
    log,
  })

  const shutdown = async () => {
    await app.close()
    await consumer.disconnect()
    await producer.disconnect()
    await pool.end()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  console.log('App running on port:', config.PORT)
}

main().catch((err) => {
  console.error('failed to start payment-service', err)
  process.exit(1)
})

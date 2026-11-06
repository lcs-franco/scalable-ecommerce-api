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
import { buildApp } from './app.js'
import { createCartClient } from './clients/cart.client.js'
import { createProductClient } from './clients/product.client.js'
import { config } from './config/env.js'
import { saga } from './config/saga.js'
import { createDb } from './db/index.js'
import { setupConsumers } from './kafka/consumers.js'

async function main() {
  const log = createLogger({
    service: 'order-service',
    level: config.LOG_LEVEL,
  })

  const { db, pool } = createDb(config.DATABASE_URL)

  observePgPool(pool)
  observeOutbox(() => outboxBacklog(db))

  const kafka = new Kafka({
    clientId: 'order-service',
    brokers: [config.KAFKA_BROKER],
    logCreator: createKafkaLogCreator(log),
    logLevel: logLevel.DEBUG,
  })

  const producer = createProducer(kafka)
  await producer.connect()

  const consumer = createConsumer(kafka, 'order-service', log, {
    onProcessed: consumerMetrics(),
  })
  await consumer.connect()

  const cartClient = createCartClient({
    baseUrl: config.CART_SERVICE_URL,
    internalServiceToken: config.INTERNAL_SERVICE_TOKEN,
  })

  const productClient = createProductClient({
    baseUrl: config.PRODUCT_SERVICE_URL,
    internalServiceToken: config.INTERNAL_SERVICE_TOKEN,
  })

  const app = await buildApp({
    db,
    logger: log,
    cartClient,
    productClient,
    createSaga: saga,
  })

  const relay = createOutboxRelay({ db, producer, log })

  await setupConsumers({
    consumer,
    orderService: app.orderService,
    log,
  })

  const metrics = await startMetricsServer({
    port: config.METRICS_PORT,
    service: 'order-service',
  })

  const shutdown = async () => {
    await app.close()
    await metrics.close()
    await relay.stop()
    await consumer.disconnect()
    await producer.disconnect()
    await pool.end()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  relay.start()
  console.log('App running on port:', config.PORT)
}

main().catch((err) => {
  console.error('failed to start order-service', err)
  process.exit(1)
})

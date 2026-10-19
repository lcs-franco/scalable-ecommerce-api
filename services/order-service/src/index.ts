/* eslint-disable no-console */
import { createConsumer, createProducer } from '@ecommerce/events'
import { Kafka } from 'kafkajs'
import { buildApp } from './app.js'
import { createCartClient } from './clients/cart.client.js'
import { createProductClient } from './clients/product.client.js'
import { config } from './config/env.js'
import { saga } from './config/saga.js'
import { createDb } from './db/index.js'
import { setupConsumers } from './kafka/consumers.js'
import { createPublishers } from './kafka/publishers.js'

async function main() {
  const { db, pool } = createDb(config.DATABASE_URL)

  const kafka = new Kafka({
    clientId: 'order-service',
    brokers: [config.KAFKA_BROKER],
  })

  const producer = createProducer(kafka)
  await producer.connect()

  const consumer = createConsumer(kafka, 'order-service')
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
    cartClient,
    productClient,
    ...createPublishers(producer),
    createSaga: saga,
  })

  await setupConsumers({
    consumer,
    orderService: app.orderService,
    log: app.log,
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
  console.error('failed to start order-service', err)
  process.exit(1)
})

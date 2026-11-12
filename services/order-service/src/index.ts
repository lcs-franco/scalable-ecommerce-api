import { createDb } from '@ecommerce/db'
import { createConsumer, createKafka, createProducer } from '@ecommerce/events'
import { createOutboxRelay, outboxBacklog } from '@ecommerce/events/outbox'
import {
  consumerMetrics,
  observeOutbox,
  observePgPool,
} from '@ecommerce/metrics'
import { runService } from '@ecommerce/service'
import { buildApp } from './app.js'
import { createCartClient } from './clients/cart.client.js'
import { createProductClient } from './clients/product.client.js'
import { config } from './config/env.js'
import { saga } from './config/saga.js'
import * as schema from './db/schema.js'
import { setupConsumers } from './kafka/consumers.js'

const name = 'order-service'

await runService({ name, config }, async ({ log, onClose, afterListen }) => {
  const { db, pool } = createDb({ url: config.DATABASE_URL, schema, log })

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
    cartClient: createCartClient({
      baseUrl: config.CART_SERVICE_URL,
      internalServiceToken: config.INTERNAL_SERVICE_TOKEN,
    }),
    productClient: createProductClient({
      baseUrl: config.PRODUCT_SERVICE_URL,
      internalServiceToken: config.INTERNAL_SERVICE_TOKEN,
    }),
    createSaga: saga,
  })

  const relay = createOutboxRelay({ db, producer, log })

  afterListen(() => relay.start())
  onClose('outbox relay', () => relay.stop())

  await setupConsumers({ consumer, orderService: app.orderService, log })

  return app
})

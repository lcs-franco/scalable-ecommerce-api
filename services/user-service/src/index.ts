import { createDb } from '@ecommerce/db'
import { createKafka, createProducer } from '@ecommerce/events'
import { createOutboxRelay, outboxBacklog } from '@ecommerce/events/outbox'
import { observeOutbox, observePgPool } from '@ecommerce/metrics'
import { runService } from '@ecommerce/service'
import { buildApp } from './app.js'
import { config } from './config.js'
import * as schema from './db/schema.js'

const name = 'user-service'

await runService({ name, config }, async ({ log, onClose, afterListen }) => {
  const { db, pool } = createDb({ url: config.DATABASE_URL, schema })

  onClose('postgres', () => pool.end())
  observePgPool(pool)
  observeOutbox(() => outboxBacklog(db))

  const producer = createProducer(
    createKafka({ service: name, broker: config.KAFKA_BROKER, log }),
  )

  onClose('kafka producer', () => producer.disconnect())
  await producer.connect()

  const relay = createOutboxRelay({ db, producer, log })

  afterListen(() => relay.start())
  onClose('outbox relay', () => relay.stop())

  return buildApp({ db, logger: log })
})

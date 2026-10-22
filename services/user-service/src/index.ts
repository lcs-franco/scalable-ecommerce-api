import { createKafkaLogCreator, createProducer } from '@ecommerce/events'
import { createOutboxRelay } from '@ecommerce/events/outbox'
import { createLogger } from '@ecommerce/logger'
import { Kafka, logLevel } from 'kafkajs'
import { buildApp } from './app.js'
import { config } from './config.js'
import { createDb } from './db/index.js'

async function main() {
  const log = createLogger({ service: 'user-service', level: config.LOG_LEVEL })

  const { db, pool } = createDb(config.DATABASE_URL)

  const kafka = new Kafka({
    clientId: 'user-service',
    brokers: [config.KAFKA_BROKER],
    logCreator: createKafkaLogCreator(log),
    logLevel: logLevel.DEBUG,
  })
  const producer = createProducer(kafka)
  await producer.connect()

  const app = await buildApp({ db, logger: log })

  const relay = createOutboxRelay({ db, producer, log })

  const shutdown = async () => {
    await app.close()
    await relay.stop()
    await producer.disconnect()
    await pool.end()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  relay.start()
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('failed to start user-service', err)
  process.exit(1)
})

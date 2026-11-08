/* eslint-disable no-console */
import { createConsumer, createKafkaLogCreator } from '@ecommerce/events'
import { createLogger } from '@ecommerce/logger'
import { consumerMetrics, startMetricsServer } from '@ecommerce/metrics'
import { Kafka, logLevel } from 'kafkajs'
import { buildApp } from './app.js'
import { config } from './config/env.js'
import { createDeduper } from './dedupe.js'
import { setupConsumers } from './kafka/consumers.js'
import { createSmtpEmailProvider } from './providers/smtp-email.provider.js'
import { createRedis } from './redis.js'
import { createNotificationService } from './services/notification.service.js'

async function main() {
  const log = createLogger({
    service: 'notification-service',
    level: config.LOG_LEVEL,
  })

  const email = await createSmtpEmailProvider({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    from: config.EMAIL_FROM,
    log,
  })

  const kafka = new Kafka({
    clientId: 'notification-service',
    brokers: [config.KAFKA_BROKER],
    logCreator: createKafkaLogCreator(log),
    logLevel: logLevel.DEBUG,
  })
  const consumer = createConsumer(kafka, 'notification-service', log, {
    onProcessed: consumerMetrics(),
  })

  await consumer.connect()

  const redis = createRedis(config.REDIS_URL)

  await redis.ping()

  const app = await buildApp({ logger: log })

  await setupConsumers({
    consumer,
    notificationService: createNotificationService({ email, log }),
    deduper: createDeduper({
      redis,
      ttlSeconds: config.DEDUPE_TTL_SECONDS,
      log,
    }),
  })

  const metrics = await startMetricsServer({
    port: config.METRICS_PORT,
    service: 'notification-service',
  })

  const shutdown = async () => {
    await app.close()
    await metrics.close()
    await consumer.disconnect()
    await redis.quit()
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
  console.log('App running on port:', config.PORT)
}

main().catch((err) => {
  console.error('failed to start notification-service', err)
  process.exit(1)
})

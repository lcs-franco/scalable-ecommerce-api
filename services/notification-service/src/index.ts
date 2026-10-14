/* eslint-disable no-console */
import { createConsumer } from '@ecommerce/events'
import { createLogger } from '@ecommerce/logger'
import { Kafka } from 'kafkajs'
import { buildApp } from './app.js'
import { config } from './config/env.js'
import { setupConsumers } from './kafka/consumers.js'
import { createSmtpEmailProvider } from './providers/smtp-email.provider.js'
import { createNotificationService } from './services/notification.service.js'

async function main() {
  const log = createLogger({ service: 'notification-service' })

  const email = await createSmtpEmailProvider({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    from: config.EMAIL_FROM,
    log,
  })

  const kafka = new Kafka({
    clientId: 'notification-service',
    brokers: [config.KAFKA_BROKER],
  })
  const consumer = createConsumer(kafka, 'notification-service')
  await consumer.connect()

  const app = await buildApp()

  await setupConsumers({
    consumer,
    notificationService: createNotificationService({ email, log }),
  })

  const shutdown = async () => {
    await app.close()
    await consumer.disconnect()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  console.log('App running on port:', config.PORT)
}

main().catch((err) => {
  console.error('failed to start notification-service', err)
  process.exit(1)
})

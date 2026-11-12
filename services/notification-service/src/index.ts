import { createConsumer, createKafka } from '@ecommerce/events'
import { consumerMetrics } from '@ecommerce/metrics'
import { createServiceApp, runService } from '@ecommerce/service'
import { config } from './config/env.js'
import { createDeduper } from './dedupe.js'
import { setupConsumers } from './kafka/consumers.js'
import { createSmtpEmailProvider } from './providers/smtp-email.provider.js'
import { createRedis } from './redis.js'
import { createNotificationService } from './services/notification.service.js'

const name = 'notification-service'

await runService({ name, config }, async ({ log, onClose }) => {
  const email = await createSmtpEmailProvider({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    from: config.EMAIL_FROM,
    log,
  })

  const redis = createRedis(config.REDIS_URL)

  onClose('redis', () => redis.quit())
  await redis.ping()

  const consumer = createConsumer(
    createKafka({ service: name, broker: config.KAFKA_BROKER, log }),
    name,
    log,
    { onProcessed: consumerMetrics() },
  )

  onClose('kafka consumer', () => consumer.disconnect())
  await consumer.connect()

  await setupConsumers({
    consumer,
    notificationService: createNotificationService({ email, log }),
    deduper: createDeduper({
      redis,
      ttlSeconds: config.DEDUPE_TTL_SECONDS,
      log,
    }),
  })

  return createServiceApp({ name, logger: log, docs: false, auth: false })
})

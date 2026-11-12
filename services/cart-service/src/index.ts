import { runService } from '@ecommerce/service'
import { buildApp } from './app.js'
import { config } from './config.js'
import { createRedis } from './redis.js'

await runService({ name: 'cart-service', config }, async ({ log, onClose }) => {
  const redis = createRedis(config.REDIS_URL)

  onClose('redis', () => redis.quit())
  await redis.ping()

  return buildApp({
    logger: log,
    redis,
    productServiceUrl: config.PRODUCT_SERVICE_URL,
    internalServiceToken: config.INTERNAL_SERVICE_TOKEN,
  })
})

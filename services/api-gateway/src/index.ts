import { upstreamMetrics } from '@ecommerce/metrics'
import { runService } from '@ecommerce/service'
import { Redis } from 'ioredis'
import { buildApp } from './app.js'
import { config } from './config/env.js'

await runService({ name: 'api-gateway', config }, async ({ log, onClose }) => {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    commandTimeout: 500,
  })

  onClose('redis', () => redis.quit())
  await redis.ping()

  return buildApp({
    logger: log,
    redis,
    jwtSecret: config.JWT_SECRET,
    upstreams: {
      user: config.USER_SERVICE_URL,
      product: config.PRODUCT_SERVICE_URL,
      cart: config.CART_SERVICE_URL,
      order: config.ORDER_SERVICE_URL,
      payment: config.PAYMENT_SERVICE_URL,
    },
    rateLimits: {
      anonymous: config.RATE_LIMIT_ANONYMOUS,
      authenticated: config.RATE_LIMIT_AUTHENTICATED,
    },
    upstreamTimeoutMs: config.UPSTREAM_TIMEOUT_MS,
    onUpstream: upstreamMetrics(),
    trustProxy: config.TRUST_PROXY,
  })
})

/* eslint-disable no-console */
import { Redis } from 'ioredis'
import { buildApp } from './app.js'
import { config } from './config/env.js'

async function main() {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    commandTimeout: 500,
  })
  await redis.ping()

  const app = await buildApp({
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
    trustProxy: config.TRUST_PROXY,
  })

  const shutdown = async () => {
    await app.close()
    redis.disconnect()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  console.log('App running on port:', config.PORT)
}

main().catch((err) => {
  console.error('failed to start api-gateway', err)
  process.exit(1)
})

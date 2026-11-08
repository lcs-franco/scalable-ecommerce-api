/* eslint-disable no-console */
import { createLogger } from '@ecommerce/logger'
import { startMetricsServer, upstreamMetrics } from '@ecommerce/metrics'
import { Redis } from 'ioredis'
import { buildApp } from './app.js'
import { config } from './config/env.js'

async function main() {
  const log = createLogger({ service: 'api-gateway', level: config.LOG_LEVEL })

  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    commandTimeout: 500,
  })
  await redis.ping()

  const app = await buildApp({
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

  const metrics = await startMetricsServer({
    port: config.METRICS_PORT,
    service: 'api-gateway',
  })

  const shutdown = async () => {
    await app.close()
    await metrics.close()
    redis.disconnect()
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
  console.error('failed to start api-gateway', err)
  process.exit(1)
})

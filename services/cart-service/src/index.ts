/* eslint-disable no-console */
import { createLogger } from '@ecommerce/logger'
import { startMetricsServer } from '@ecommerce/metrics'
import { buildApp } from './app.js'
import { config } from './config.js'
import { createRedis } from './redis.js'

async function main() {
  const log = createLogger({ service: 'cart-service', level: config.LOG_LEVEL })

  const redis = createRedis(config.REDIS_URL)

  const app = await buildApp({
    logger: log,
    redis,
    productServiceUrl: config.PRODUCT_SERVICE_URL,
    internalServiceToken: config.INTERNAL_SERVICE_TOKEN,
  })

  const metrics = await startMetricsServer({
    port: config.METRICS_PORT,
    service: 'cart-service',
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
  console.error('failed to start cart-service', err)
  process.exit(1)
})

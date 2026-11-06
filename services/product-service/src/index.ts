/* eslint-disable no-console */
import { createLogger } from '@ecommerce/logger'
import { observePgPool, startMetricsServer } from '@ecommerce/metrics'
import { buildApp } from './app.js'
import { config } from './config.js'
import { createDb } from './db/index.js'

async function main() {
  const log = createLogger({
    service: 'product-service',
    level: config.LOG_LEVEL,
  })

  const { db, pool } = createDb(config.DATABASE_URL)

  observePgPool(pool)

  const app = await buildApp({
    logger: log,
    db,
    internalServiceToken: config.INTERNAL_SERVICE_TOKEN,
  })

  const metrics = await startMetricsServer({
    port: config.METRICS_PORT,
    service: 'product-service',
  })

  const shutdown = async () => {
    await app.close()
    await metrics.close()
    await pool.end()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  console.log('App running on port:', config.PORT)
}

main().catch((err) => {
  console.error('failed to start product-service', err)
  process.exit(1)
})

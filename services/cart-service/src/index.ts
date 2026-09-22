/* eslint-disable no-console */
import { buildApp } from './app.js'
import { config } from './config.js'
import { createRedis } from './redis.js'

async function main() {
  const redis = createRedis(config.REDIS_URL)

  const app = await buildApp({
    redis,
    productServiceUrl: config.PRODUCT_SERVICE_URL,
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
  console.error('failed to start cart-service', err)
  process.exit(1)
})

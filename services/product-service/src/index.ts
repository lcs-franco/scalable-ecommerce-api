/* eslint-disable no-console */
import { buildApp } from './app.js'
import { config } from './config.js'
import { createDb } from './db/index.js'

async function main() {
  const { db, pool } = createDb(config.DATABASE_URL)

  const app = await buildApp({
    db,
    internalServiceToken: config.INTERNAL_SERVICE_TOKEN,
  })

  const shutdown = async () => {
    await app.close()
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

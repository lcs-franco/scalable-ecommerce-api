import { createDb } from '@ecommerce/db'
import { observePgPool } from '@ecommerce/metrics'
import { runService } from '@ecommerce/service'
import { buildApp } from './app.js'
import { config } from './config.js'
import * as schema from './db/schema.js'

await runService(
  { name: 'product-service', config },
  async ({ log, onClose }) => {
    const { db, pool } = createDb({ url: config.DATABASE_URL, schema, log })

    onClose('postgres', () => pool.end())
    observePgPool(pool)

    return buildApp({
      logger: log,
      db,
      internalServiceToken: config.INTERNAL_SERVICE_TOKEN,
    })
  },
)

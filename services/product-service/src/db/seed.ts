/* eslint-disable no-console */
import { createDb, runMigrations } from '@ecommerce/db'
import { createLogger } from '@ecommerce/logger'
import { config } from '../config.js'
import { MIGRATIONS_FOLDER } from './index.js'
import * as schema from './schema.js'
import { seedSampleData } from './sample-data.js'

async function seed() {
  const { db, pool } = createDb({
    url: config.DATABASE_URL,
    schema,
    log: createLogger({ service: 'product-seed', level: config.LOG_LEVEL }),
  })

  await runMigrations(db, MIGRATIONS_FOLDER)

  await seedSampleData(db)
  console.log('seed data inserted')

  await pool.end()
}

seed().catch((err) => {
  console.error('seed failed', err)
  process.exit(1)
})

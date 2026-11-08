/* eslint-disable no-console */
import { config } from '../config.js'
import { createDb } from './index.js'
import { runMigrations } from './migrate.js'
import { seedSampleData } from './sample-data.js'

async function seed() {
  const { db, pool } = createDb(config.DATABASE_URL)

  await runMigrations(db)

  await seedSampleData(db)
  console.log('seed data inserted')

  await pool.end()
}

seed().catch((err) => {
  console.error('seed failed', err)
  process.exit(1)
})

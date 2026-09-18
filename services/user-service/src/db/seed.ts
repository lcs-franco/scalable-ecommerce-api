import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { config } from '../config.js'
import { createDb } from './index.js'
import { runMigrations } from './migrate.js'
import { users } from './schema.js'

const ADMIN_EMAIL = 'admin@example.com'
const ADMIN_NAME = 'Admin'

async function seed() {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD env var is required for seeding')
  }

  const { db, pool } = createDb(config.DATABASE_URL)
  await runMigrations(db)

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1)

  if (existing.length > 0) {
    // eslint-disable-next-line no-console
    console.log('admin user already exists, skipping seed')
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 12)
    await db.insert(users).values({
      email: ADMIN_EMAIL,
      passwordHash,
      name: ADMIN_NAME,
      role: 'admin',
    })
    // eslint-disable-next-line no-console
    console.log(`admin user created: ${ADMIN_EMAIL}`)
  }

  await pool.end()
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed failed', err)
  process.exit(1)
})

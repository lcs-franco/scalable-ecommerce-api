import 'dotenv/config'
import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { createDb } from './index.js'
import { runMigrations } from './migrate.js'
import { users } from './schema.js'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ecommerce:ecommerce_dev@localhost:5432/user_db'

const ADMIN_EMAIL = 'admin@example.com'
const ADMIN_PASSWORD = 'admin123'
const ADMIN_NAME = 'Admin'

async function seed() {
  const { db, pool } = createDb(DATABASE_URL)
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
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
    await db.insert(users).values({
      email: ADMIN_EMAIL,
      passwordHash,
      name: ADMIN_NAME,
      role: 'admin',
    })
    // eslint-disable-next-line no-console
    console.log(`admin user created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  }

  await pool.end()
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed failed', err)
  process.exit(1)
})

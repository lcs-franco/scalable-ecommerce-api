import { sql } from 'drizzle-orm'
import { buildApp } from '../app.js'
import { createDb } from '../db/index.js'

process.env.JWT_SECRET ??= 'test-secret'

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ecommerce:ecommerce_dev@localhost:5432/user_db'

export async function createTestApp() {
  const { db, pool } = createDb(TEST_DATABASE_URL)

  const publishedEvents: Array<{
    userId: string
    email: string
    name: string
  }> = []

  const app = await buildApp({
    db,
    publishUserRegistered: async (data) => {
      publishedEvents.push(data)
    },
  })

  await app.ready()

  return { app, db, pool, publishedEvents }
}

export async function cleanDb(db: ReturnType<typeof createDb>['db']) {
  await db.execute(sql`DELETE FROM refresh_tokens`)
  await db.execute(sql`DELETE FROM users`)
}

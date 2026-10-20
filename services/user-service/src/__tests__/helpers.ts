import { asc, sql } from 'drizzle-orm'
import { buildApp } from '../app.js'
import { createDb } from '../db/index.js'
import { outbox } from '../db/schema.js'

process.env.JWT_SECRET ??= 'test-secret'

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ecommerce:ecommerce_dev@localhost:5432/user_db'

export async function createTestApp() {
  const { db, pool } = createDb(TEST_DATABASE_URL)

  const app = await buildApp({ db })

  await app.ready()

  return { app, db, pool }
}

export async function outboxEvents(db: ReturnType<typeof createDb>['db']) {
  const rows = await db.select().from(outbox).orderBy(asc(outbox.createdAt))

  return rows.map((row) => ({
    topic: row.topic,
    key: row.key,
    data: row.payload,
  }))
}

export async function cleanDb(db: ReturnType<typeof createDb>['db']) {
  await db.execute(sql`DELETE FROM outbox`)
  await db.execute(sql`DELETE FROM refresh_tokens`)
  await db.execute(sql`DELETE FROM users`)
}

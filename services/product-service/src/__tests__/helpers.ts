import { createDb } from '@ecommerce/db'
import { createLogger } from '@ecommerce/logger'
import { sql } from 'drizzle-orm'
import { buildApp } from '../app.js'
import type { Db } from '../db/index.js'
import * as schema from '../db/schema.js'

process.env.JWT_SECRET ??= 'test-secret-must-be-at-least-32-chars!'

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ecommerce:ecommerce_dev@localhost:5432/product_db'

export async function createTestApp() {
  const logger = createLogger({ service: 'product-service', level: 'silent' })
  const { db, pool } = createDb({
    url: TEST_DATABASE_URL,
    schema,
    log: logger,
  })

  const app = await buildApp({
    db,
    logger,
    internalServiceToken: 'test-internal-token',
  })

  await app.ready()

  return { app, db, pool }
}

export function adminToken(
  app: Awaited<ReturnType<typeof createTestApp>>['app'],
) {
  return app.jwt.sign({
    userId: 'admin-id',
    email: 'admin@test.com',
    role: 'admin',
  })
}

export function userToken(
  app: Awaited<ReturnType<typeof createTestApp>>['app'],
) {
  return app.jwt.sign({
    userId: 'user-id',
    email: 'user@test.com',
    role: 'user',
  })
}

export async function cleanDb(db: Db) {
  await db.execute(sql`DELETE FROM stock_restorations`)
  await db.execute(sql`DELETE FROM products`)
  await db.execute(sql`DELETE FROM categories`)
}

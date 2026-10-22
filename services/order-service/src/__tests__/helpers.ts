import { createLogger } from '@ecommerce/logger'
import type { TopicName } from '@ecommerce/events'
import { asc, eq, sql } from 'drizzle-orm'
import { buildApp } from '../app.js'
import { saga } from '../config/saga.js'
import { createDb } from '../db/index.js'
import { outbox } from '../db/schema.js'

process.env.JWT_SECRET ??= 'test-secret-must-be-at-least-32-chars!'

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ecommerce:ecommerce_dev@localhost:5432/order_db'

export const PRODUCT_1 = '00000000-0000-0000-0000-000000000101'
export const PRODUCT_2 = '00000000-0000-0000-0000-000000000102'

export function mockCartClient() {
  return {
    checkout: async (_userId: string) => [
      { productId: PRODUCT_1, quantity: 2 },
      { productId: PRODUCT_2, quantity: 1 },
    ],
    restore: async () => {},
  }
}

export function mockProductClient() {
  const restoreOrderStockCalls: {
    orderId: string
    items: { productId: string; quantity: number }[]
  }[] = []
  return {
    restoreOrderStockCalls,
    validateOrder: async (items: { productId: string; quantity: number }[]) =>
      items.map((item) => ({
        productId: item.productId,
        name: `Product ${item.productId}`,
        price: 1000,
        quantity: item.quantity,
      })),
    restoreStock: async () => {},
    restoreOrderStock: async (
      orderId: string,
      items: { productId: string; quantity: number }[],
    ) => {
      restoreOrderStockCalls.push({ orderId, items })
    },
  }
}

export async function createTestApp(overrides?: {
  cartClient?: ReturnType<typeof mockCartClient>
  productClient?: ReturnType<typeof mockProductClient>
}) {
  const { db, pool } = createDb(TEST_DATABASE_URL)

  const app = await buildApp({
    db,
    logger: createLogger({ service: 'order-service', level: 'silent' }),
    cartClient: overrides?.cartClient ?? mockCartClient(),
    productClient: overrides?.productClient ?? mockProductClient(),
    createSaga: saga,
  })
  await app.ready()

  return { app, db, pool }
}

const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000002'
export const DEFAULT_USER_EMAIL = 'user@test.com'

export function adminToken(
  app: Awaited<ReturnType<typeof createTestApp>>['app'],
) {
  return app.jwt.sign({
    userId: ADMIN_ID,
    email: 'admin@test.com',
    role: 'admin',
  })
}

export function userToken(
  app: Awaited<ReturnType<typeof createTestApp>>['app'],
  userId = DEFAULT_USER_ID,
) {
  return app.jwt.sign({
    userId,
    email: DEFAULT_USER_EMAIL,
    role: 'user',
  })
}

export async function outboxEvents(
  db: ReturnType<typeof createDb>['db'],
  topic?: TopicName,
) {
  const rows = await db
    .select()
    .from(outbox)
    .where(topic ? eq(outbox.topic, topic) : undefined)
    .orderBy(asc(outbox.createdAt))

  return rows.map((row) => ({
    topic: row.topic,
    key: row.key,
    data: row.payload,
  }))
}

export async function cleanDb(db: ReturnType<typeof createDb>['db']) {
  await db.execute(sql`DELETE FROM outbox`)
  await db.execute(sql`DELETE FROM order_items`)
  await db.execute(sql`DELETE FROM orders`)
}

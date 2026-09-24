import { sql } from 'drizzle-orm'
import { buildApp } from '../app.js'
import { saga } from '../config/saga.js'
import { createDb } from '../db/index.js'

process.env.JWT_SECRET ??= 'test-secret-must-be-at-least-32-chars!'

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ecommerce:ecommerce_dev@localhost:5432/order_db'

const PRODUCT_1 = '00000000-0000-0000-0000-000000000101'
const PRODUCT_2 = '00000000-0000-0000-0000-000000000102'

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
  return {
    validateOrder: async (
      items: { productId: string; quantity: number }[],
      _token: string,
    ) =>
      items.map((item) => ({
        productId: item.productId,
        name: `Product ${item.productId}`,
        price: 1000,
        quantity: item.quantity,
      })),
    restoreStock: async () => {},
  }
}

export function mockPublishers() {
  const events: { topic: string; data: unknown }[] = []
  return {
    events,
    publishOrderPlaced: async (data: unknown) => {
      events.push({ topic: 'order.placed', data })
    },
    publishOrderStatusChanged: async (data: unknown) => {
      events.push({ topic: 'order.status-changed', data })
    },
  }
}

export async function createTestApp(overrides?: {
  cartClient?: ReturnType<typeof mockCartClient>
  productClient?: ReturnType<typeof mockProductClient>
}) {
  const { db, pool } = createDb(TEST_DATABASE_URL)
  const publishers = mockPublishers()

  const { app, orderService } = await buildApp({
    db,
    cartClient: overrides?.cartClient ?? mockCartClient(),
    productClient: overrides?.productClient ?? mockProductClient(),
    publishOrderPlaced: publishers.publishOrderPlaced,
    publishOrderStatusChanged: publishers.publishOrderStatusChanged,
    createSaga: saga,
  })
  await app.ready()

  return { app, db, pool, orderService, publishers }
}

const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000002'

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
    email: 'user@test.com',
    role: 'user',
  })
}

export async function cleanDb(db: ReturnType<typeof createDb>['db']) {
  await db.execute(sql`DELETE FROM order_items`)
  await db.execute(sql`DELETE FROM orders`)
}

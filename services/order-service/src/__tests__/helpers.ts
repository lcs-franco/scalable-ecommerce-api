import { sql } from 'drizzle-orm'
import { buildApp } from '../app.js'
import { saga } from '../config/saga.js'
import { createDb } from '../db/index.js'
import type { createPublishers } from '../kafka/publishers.js'

process.env.JWT_SECRET ??= 'test-secret-must-be-at-least-32-chars!'

const TEST_DATABASE_URL =
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
  publishers?: ReturnType<typeof createPublishers>
}) {
  const { db, pool } = createDb(TEST_DATABASE_URL)
  const publishers = mockPublishers()
  const publish = overrides?.publishers ?? publishers

  const { app, orderService } = await buildApp({
    db,
    cartClient: overrides?.cartClient ?? mockCartClient(),
    productClient: overrides?.productClient ?? mockProductClient(),
    publishOrderPlaced: publish.publishOrderPlaced,
    publishOrderStatusChanged: publish.publishOrderStatusChanged,
    createSaga: saga,
  })
  await app.ready()

  return { app, db, pool, orderService, publishers }
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

export async function cleanDb(db: ReturnType<typeof createDb>['db']) {
  await db.execute(sql`DELETE FROM order_items`)
  await db.execute(sql`DELETE FROM orders`)
}

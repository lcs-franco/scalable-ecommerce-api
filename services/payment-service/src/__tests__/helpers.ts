import type { TopicName } from '@ecommerce/events'
import { asc, eq, sql } from 'drizzle-orm'
import { buildApp } from '../app.js'
import { createDb } from '../db/index.js'
import { outbox } from '../db/schema.js'
import type {
  IPaymentProcessor,
  PaymentResult,
} from '../payments/payment-processor.js'

process.env.JWT_SECRET ??= 'test-secret-must-be-at-least-32-chars!'

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ecommerce:ecommerce_dev@localhost:5432/payment_db'

export const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000002'
export const DEFAULT_USER_EMAIL = 'user@test.com'
export const OTHER_USER_ID = '00000000-0000-0000-0000-000000000003'

export function fakeProcessor() {
  const calls: Parameters<IPaymentProcessor['processPayment']>[0][] = []
  let next: PaymentResult = { success: true, providerPaymentId: 'pi_fake_1' }

  const processor: IPaymentProcessor = {
    name: 'stripe',
    processPayment: async (input) => {
      calls.push(input)
      return next
    },
  }

  return {
    processor,
    calls,
    willReturn(result: PaymentResult) {
      next = result
    },
  }
}

export async function createTestApp() {
  const { db, pool } = createDb(TEST_DATABASE_URL)
  const fake = fakeProcessor()

  const app = await buildApp({ db, processor: fake.processor })
  await app.ready()

  return { app, db, pool, fake }
}

type App = Awaited<ReturnType<typeof createTestApp>>['app']

export function adminToken(app: App) {
  return app.jwt.sign({
    userId: ADMIN_ID,
    email: 'admin@test.com',
    role: 'admin',
  })
}

export function userToken(app: App, userId = DEFAULT_USER_ID) {
  return app.jwt.sign({
    userId,
    email: DEFAULT_USER_EMAIL,
    role: 'user',
  })
}

export function orderPlacedEvent(
  overrides?: Partial<{
    orderId: string
    userId: string
    total: number
    paymentMethodId: string
  }>,
) {
  return {
    orderId: overrides?.orderId ?? crypto.randomUUID(),
    userId: overrides?.userId ?? DEFAULT_USER_ID,
    email: DEFAULT_USER_EMAIL,
    items: [
      {
        productId: '00000000-0000-0000-0000-000000000101',
        name: 'Product 101',
        quantity: 2,
        price: 1500,
      },
    ],
    total: overrides?.total ?? 3000,
    paymentMethodId: overrides?.paymentMethodId ?? 'pm_card_visa',
  }
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
  await db.execute(sql`DELETE FROM payments`)
}

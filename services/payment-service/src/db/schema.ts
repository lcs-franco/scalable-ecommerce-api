import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import type { ProviderName } from '../payments/payment-processor.js'

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'confirmed',
  'failed',
])

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().unique(),
  userId: uuid('user_id').notNull(),
  userEmail: varchar('user_email').notNull(),
  amount: integer('amount').notNull(),
  status: paymentStatusEnum('status').notNull().default('pending'),
  provider: text('provider').$type<ProviderName>(),
  providerPaymentId: varchar('provider_payment_id'),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type Payment = typeof payments.$inferSelect

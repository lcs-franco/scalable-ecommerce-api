import {
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
])

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number]

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  userEmail: varchar('user_email').notNull(),
  status: orderStatusEnum('status').notNull().default('pending'),
  total: integer('total').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  productId: uuid('product_id').notNull(),
  productName: varchar('product_name').notNull(),
  price: integer('price').notNull(),
  quantity: integer('quantity').notNull(),
})

export { outbox } from '@ecommerce/events/outbox'

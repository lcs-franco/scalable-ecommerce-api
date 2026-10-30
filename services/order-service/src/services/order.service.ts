import type { ITokenPayload } from '@ecommerce/auth'
import { Topics } from '@ecommerce/events'
import { enqueue, type OutboxDb } from '@ecommerce/events/outbox'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { createCartClient } from '../clients/cart.client.js'
import type { createProductClient } from '../clients/product.client.js'
import { saga } from '../config/saga.js'
import type { Db } from '../db/index.js'
import { orderItems, orders, type OrderStatus } from '../db/schema.js'
import { InvalidStatusTransition, OrderNotFound } from '../errors/index.js'

export interface IListOptions {
  userId?: string
  limit: number
  offset: number
  status?: OrderStatus
}

type Order = typeof orders.$inferSelect

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

interface IDeps {
  db: Db
  cartClient: ReturnType<typeof createCartClient>
  productClient: ReturnType<typeof createProductClient>
  createSaga: typeof saga
}

function enqueueStatusChanged(tx: OutboxDb, order: Order) {
  return enqueue(
    tx,
    Topics.ORDER_STATUS_CHANGED,
    {
      orderId: order.id,
      userId: order.userId,
      email: order.userEmail,
      status: order.status,
    },
    { key: order.id },
  )
}

export function createOrderService(deps: IDeps) {
  const { db, cartClient, productClient, createSaga } = deps

  async function placeOrder(
    user: Pick<ITokenPayload, 'userId' | 'email'>,
    userToken: string,
    paymentMethodId: string,
    requestId?: string,
  ) {
    const { userId, email } = user
    const s = createSaga()
    return s.run(async () => {
      const cart = await cartClient.checkout(userId, requestId)
      s.addCompensation(() => cartClient.restore(cart, userToken, requestId))

      const validatedItems = await productClient.validateOrder(cart, requestId)
      s.addCompensation(() =>
        productClient.restoreStock(validatedItems, requestId),
      )

      const total = validatedItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      )

      return db.transaction(async (tx) => {
        const [order] = await tx
          .insert(orders)
          .values({ userId, userEmail: email, total })
          .returning()

        const insertedItems = await tx
          .insert(orderItems)
          .values(
            validatedItems.map((item) => ({
              orderId: order.id,
              productId: item.productId,
              productName: item.name,
              price: item.price,
              quantity: item.quantity,
            })),
          )
          .returning()

        await enqueue(
          tx,
          Topics.ORDER_PLACED,
          {
            orderId: order.id,
            userId,
            email,
            items: validatedItems,
            total,
            paymentMethodId,
          },
          { key: order.id },
        )

        return { ...order, items: insertedItems }
      })
    })
  }

  async function list(opts: IListOptions) {
    const conditions = []

    if (opts.userId) {
      conditions.push(eq(orders.userId, opts.userId))
    }

    if (opts.status) {
      conditions.push(eq(orders.status, opts.status))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [items, [countResult]] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(where)
        .limit(opts.limit)
        .offset(opts.offset)
        .orderBy(desc(orders.createdAt)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(where),
    ])

    return { items, total: countResult.count }
  }

  async function findById(id: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1)
    if (!order) throw new OrderNotFound()

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id))

    return { ...order, items }
  }

  async function updateStatus(
    id: string,
    newStatus: OrderStatus,
    requestId?: string,
  ) {
    const [existing] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1)
    if (!existing) throw new OrderNotFound()

    const currentStatus = existing.status

    if (!VALID_TRANSITIONS[currentStatus].includes(newStatus)) {
      throw new InvalidStatusTransition(currentStatus, newStatus)
    }

    const updated =
      newStatus === 'cancelled'
        ? await cancel(id, currentStatus, requestId)
        : await transition(id, currentStatus, newStatus)

    if (!updated) {
      const [latest] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1)
      if (!latest) throw new OrderNotFound()

      throw new InvalidStatusTransition(latest.status, newStatus)
    }

    return updated
  }

  async function markAsPaid(orderId: string) {
    await transition(orderId, 'pending', 'paid')
  }

  async function markAsCancelled(orderId: string) {
    await cancel(orderId, 'pending')
  }

  async function transition(
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
  ) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(orders)
        .set({ status: to })
        .where(and(eq(orders.id, orderId), eq(orders.status, from)))
        .returning()

      if (row) await enqueueStatusChanged(tx, row)

      return row
    })
  }

  async function cancel(
    orderId: string,
    from: OrderStatus,
    requestId?: string,
  ) {
    return db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.status, from)))
        // Held across the restore call so a concurrent markAsPaid cannot land
        // between the restore and the update.
        .for('update')
      if (!order) return undefined

      const items = await tx
        .select({
          productId: orderItems.productId,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))

      await productClient.restoreOrderStock(orderId, items, requestId)

      const [row] = await tx
        .update(orders)
        .set({ status: 'cancelled' })
        .where(eq(orders.id, orderId))
        .returning()

      await enqueueStatusChanged(tx, row)

      return row
    })
  }

  return {
    placeOrder,
    list,
    findById,
    updateStatus,
    markAsPaid,
    markAsCancelled,
  }
}

export type OrderService = ReturnType<typeof createOrderService>

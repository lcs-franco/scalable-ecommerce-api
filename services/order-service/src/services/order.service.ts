import { and, desc, eq, sql } from 'drizzle-orm'
import type { createCartClient } from '../clients/cart.client.js'
import type { createProductClient } from '../clients/product.client.js'
import { saga } from '../config/saga.js'
import type { Db } from '../db/index.js'
import { orderItems, orders } from '../db/schema.js'
import { InvalidStatusTransition, OrderNotFound } from '../errors/index.js'

export interface IListOptions {
  userId?: string
  limit: number
  offset: number
  status?: string
}

type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled'

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
  publishOrderPlaced: (data: {
    orderId: string
    userId: string
    items: { productId: string; quantity: number; price: number }[]
    total: number
  }) => Promise<void>
  publishOrderStatusChanged: (data: {
    orderId: string
    status: OrderStatus
  }) => Promise<void>
  createSaga: typeof saga
}

export function createOrderService(deps: IDeps) {
  const {
    db,
    cartClient,
    productClient,
    publishOrderPlaced,
    publishOrderStatusChanged,
    createSaga,
  } = deps

  async function placeOrder(userId: string, userToken: string) {
    const s = createSaga()
    return s.run(async () => {
      const cart = await cartClient.checkout(userId)
      s.addCompensation(() => cartClient.restore(cart, userToken))

      const validatedItems = await productClient.validateOrder(cart, userToken)
      s.addCompensation(() => productClient.restoreStock(validatedItems))

      const total = validatedItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      )

      const result = await db.transaction(async (tx) => {
        const [order] = await tx
          .insert(orders)
          .values({ userId, total })
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

        return { ...order, items: insertedItems }
      })

      try {
        await publishOrderPlaced({
          orderId: result.id,
          userId,
          items: validatedItems,
          total,
        })
      } catch {
        // Fire-and-forget — don't fail the request
      }

      return result
    })
  }

  async function list(opts: IListOptions) {
    const conditions = []

    if (opts.userId) {
      conditions.push(eq(orders.userId, opts.userId))
    }
    if (opts.status) {
      conditions.push(eq(orders.status, opts.status as OrderStatus))
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

  async function updateStatus(id: string, newStatus: OrderStatus) {
    const [existing] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1)
    if (!existing) throw new OrderNotFound()

    const currentStatus = existing.status as OrderStatus
    if (!VALID_TRANSITIONS[currentStatus].includes(newStatus)) {
      throw new InvalidStatusTransition(currentStatus, newStatus)
    }

    const [updated] = await db
      .update(orders)
      .set({ status: newStatus })
      .where(and(eq(orders.id, id), eq(orders.status, currentStatus)))
      .returning()

    if (!updated) {
      const [latest] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1)
      if (!latest) throw new OrderNotFound()
      throw new InvalidStatusTransition(latest.status as OrderStatus, newStatus)
    }

    try {
      await publishOrderStatusChanged({ orderId: id, status: newStatus })
    } catch {
      // Fire-and-forget — don't fail the request
    }

    return updated
  }

  async function markAsPaid(orderId: string) {
    const [row] = await db
      .update(orders)
      .set({ status: 'paid' })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
      .returning()

    if (row) {
      try {
        await publishOrderStatusChanged({ orderId, status: 'paid' })
      } catch {
        // Fire-and-forget — don't fail the consumer
      }
    }
  }

  async function markAsCancelled(orderId: string) {
    const [row] = await db
      .update(orders)
      .set({ status: 'cancelled' })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
      .returning()
    if (!row) return

    try {
      await publishOrderStatusChanged({ orderId, status: 'cancelled' })
    } catch {
      // Fire-and-forget — don't fail the consumer
    }
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

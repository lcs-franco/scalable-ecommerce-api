import { and, eq, gte, ilike, or, sql } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { categories, products } from '../db/schema.js'
import { InsufficientStock, ProductNotFound } from '../errors/index.js'

interface IListOptions {
  limit: number
  offset: number
  categoryId?: string
  q?: string
}

interface IOrderItem {
  productId: string
  quantity: number
}

export function createProductService(db: Db) {
  async function list(opts: IListOptions) {
    const conditions = []

    if (opts.categoryId) {
      conditions.push(eq(products.categoryId, opts.categoryId))
    }
    if (opts.q) {
      const pattern = `%${opts.q}%`
      conditions.push(
        or(ilike(products.name, pattern), ilike(products.description, pattern)),
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [items, countResult] = await Promise.all([
      db
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          price: products.price,
          stock: products.stock,
          categoryId: products.categoryId,
          categoryName: categories.name,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(where)
        .limit(opts.limit)
        .offset(opts.offset)
        .orderBy(products.createdAt),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(where),
    ])

    return { items, total: countResult[0].count }
  }

  async function findById(id: string) {
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        stock: products.stock,
        categoryId: products.categoryId,
        categoryName: categories.name,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.id, id))
      .limit(1)
    if (!rows[0]) throw new ProductNotFound()
    return rows[0]
  }

  async function create(data: {
    name: string
    description?: string
    price: number
    stock: number
    categoryId: string
  }) {
    const rows = await db.insert(products).values(data).returning()
    return rows[0]
  }

  async function update(
    id: string,
    data: {
      name?: string
      description?: string
      price?: number
      stock?: number
      categoryId?: string
    },
  ) {
    const rows = await db
      .update(products)
      .set(data)
      .where(eq(products.id, id))
      .returning()
    if (!rows[0]) throw new ProductNotFound()
    return rows[0]
  }

  async function remove(id: string) {
    const rows = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning()
    if (!rows[0]) throw new ProductNotFound()
  }

  async function validateOrder(items: IOrderItem[]) {
    return db.transaction(async (tx) => {
      const validated = []

      for (const item of items) {
        const rows = await tx
          .update(products)
          .set({
            stock: sql`stock - ${item.quantity}`,
          })
          .where(
            and(
              eq(products.id, item.productId),
              gte(products.stock, item.quantity),
            ),
          )
          .returning()

        if (!rows[0]) throw new InsufficientStock(item.productId)

        validated.push({
          productId: rows[0].id,
          name: rows[0].name,
          price: rows[0].price,
          quantity: item.quantity,
        })
      }

      return validated
    })
  }

  async function restoreStock(items: IOrderItem[]) {
    return db.transaction(async (tx) => {
      for (const item of items) {
        const [updated] = await tx
          .update(products)
          .set({
            stock: sql`stock + ${item.quantity}`,
          })
          .where(eq(products.id, item.productId))
          .returning()

        if (!updated) throw new ProductNotFound()
      }
    })
  }

  return { list, findById, create, update, remove, validateOrder, restoreStock }
}

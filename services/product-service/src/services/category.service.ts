import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { categories, products } from '../db/schema.js'
import { CategoryInUse, CategoryNotFound } from '../errors/index.js'

export function createCategoryService(db: Db) {
  async function findAll() {
    return db.select().from(categories).orderBy(categories.name)
  }

  async function findById(id: string) {
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1)
    if (!rows[0]) throw new CategoryNotFound()
    return rows[0]
  }

  async function create(name: string) {
    const rows = await db.insert(categories).values({ name }).returning()
    return rows[0]
  }

  async function update(id: string, name: string) {
    const rows = await db
      .update(categories)
      .set({ name })
      .where(eq(categories.id, id))
      .returning()
    if (!rows[0]) throw new CategoryNotFound()
    return rows[0]
  }

  async function remove(id: string) {
    const refs = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.categoryId, id))
      .limit(1)
    if (refs.length > 0) throw new CategoryInUse()

    const rows = await db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning()
    if (!rows[0]) throw new CategoryNotFound()
  }

  return { findAll, findById, create, update, remove }
}

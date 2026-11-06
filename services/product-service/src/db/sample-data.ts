import type { Db } from './index.js'
import { categories, products } from './schema.js'

async function upsertCategory(db: Db, name: string) {
  const [row] = await db
    .insert(categories)
    .values({ name })
    .onConflictDoUpdate({ target: categories.name, set: { name } })
    .returning()

  return row
}

export async function seedSampleData(db: Db) {
  const electronics = await upsertCategory(db, 'Electronics')
  const clothing = await upsertCategory(db, 'Clothing')
  const books = await upsertCategory(db, 'Books')

  await db
    .insert(products)
    .values([
      {
        name: 'Wireless Headphones',
        description: 'Noise-cancelling over-ear headphones',
        price: 9999,
        stock: 50,
        categoryId: electronics.id,
      },
      {
        name: 'USB-C Cable',
        description: 'Fast charging 2m cable',
        price: 1299,
        stock: 200,
        categoryId: electronics.id,
      },
      {
        name: 'Cotton T-Shirt',
        description: '100% organic cotton, black',
        price: 2499,
        stock: 100,
        categoryId: clothing.id,
      },
      {
        name: 'Running Shoes',
        description: 'Lightweight running shoes',
        price: 8999,
        stock: 30,
        categoryId: clothing.id,
      },
      {
        name: 'Clean Code',
        description: 'A Handbook of Agile Software Craftsmanship',
        price: 3499,
        stock: 75,
        categoryId: books.id,
      },
    ])
    .onConflictDoNothing()
}

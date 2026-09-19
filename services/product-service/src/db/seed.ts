/* eslint-disable no-console */
import { config } from '../config.js'
import { createDb } from './index.js'
import { runMigrations } from './migrate.js'
import { categories, products } from './schema.js'

async function seed() {
  const { db, pool } = createDb(config.DATABASE_URL)
  await runMigrations(db)

  const [electronics] = await db
    .insert(categories)
    .values({ name: 'Electronics' })
    .onConflictDoNothing()
    .returning()

  const [clothing] = await db
    .insert(categories)
    .values({ name: 'Clothing' })
    .onConflictDoNothing()
    .returning()

  const [books] = await db
    .insert(categories)
    .values({ name: 'Books' })
    .onConflictDoNothing()
    .returning()

  if (electronics && clothing && books) {
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
    console.log('seed data inserted')
  } else {
    console.log('categories already exist, skipping seed')
  }

  await pool.end()
}

seed().catch((err) => {
  console.error('seed failed', err)
  process.exit(1)
})

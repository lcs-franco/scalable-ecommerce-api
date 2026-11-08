import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { seedSampleData } from '../db/sample-data.js'
import { cleanDb, createTestApp } from './helpers.js'

describe('seedSampleData', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app']
  let db: Awaited<ReturnType<typeof createTestApp>>['db']
  let pool: Awaited<ReturnType<typeof createTestApp>>['pool']

  beforeAll(async () => {
    const ctx = await createTestApp()

    app = ctx.app
    db = ctx.db
    pool = ctx.pool
  })

  afterEach(async () => {
    await cleanDb(db)
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  it('should leave exactly the 5 sample products when run twice', async () => {
    await seedSampleData(db)
    await seedSampleData(db)

    const res = await app.inject({ method: 'GET', url: '/products' })

    expect(res.statusCode).toBe(200)

    const names = res.json().items.map((p: { name: string }) => p.name)

    expect(names.sort()).toEqual([
      'Clean Code',
      'Cotton T-Shirt',
      'Running Shoes',
      'USB-C Cable',
      'Wireless Headphones',
    ])
  })
})

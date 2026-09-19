import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { adminToken, cleanDb, createTestApp, userToken } from './helpers.js'

async function createCategory(app: any) {
  const res = await app.inject({
    method: 'POST',
    url: '/categories',
    headers: { authorization: `Bearer ${adminToken(app)}` },
    payload: { name: `Cat-${Date.now()}` },
  })
  return res.json()
}

async function createProduct(app: any, categoryId: string, overrides = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/products',
    headers: { authorization: `Bearer ${adminToken(app)}` },
    payload: {
      name: 'Test Product',
      description: 'A test product',
      price: 1999,
      stock: 50,
      categoryId,
      ...overrides,
    },
  })
  return res.json()
}

describe('product routes', () => {
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

  describe('POST /products', () => {
    it('should create a product as admin', async () => {
      const category = await createCategory(app)
      const res = await app.inject({
        method: 'POST',
        url: '/products',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: {
          name: 'Headphones',
          description: 'Wireless',
          price: 9999,
          stock: 10,
          categoryId: category.id,
        },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().name).toBe('Headphones')
      expect(res.json().price).toBe(9999)
    })

    it('should return 403 for non-admin', async () => {
      const category = await createCategory(app)
      const res = await app.inject({
        method: 'POST',
        url: '/products',
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: {
          name: 'Headphones',
          price: 9999,
          stock: 10,
          categoryId: category.id,
        },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  describe('GET /products', () => {
    it('should list products with pagination', async () => {
      const category = await createCategory(app)
      await createProduct(app, category.id, { name: 'Product A' })
      await createProduct(app, category.id, { name: 'Product B' })

      const res = await app.inject({
        method: 'GET',
        url: '/products?limit=1&offset=0',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().items).toHaveLength(1)
      expect(res.json().total).toBe(2)
    })

    it('should filter by categoryId', async () => {
      const cat1 = await createCategory(app)
      const cat2 = await createCategory(app)
      await createProduct(app, cat1.id, { name: 'In Cat1' })
      await createProduct(app, cat2.id, { name: 'In Cat2' })

      const res = await app.inject({
        method: 'GET',
        url: `/products?categoryId=${cat1.id}`,
      })

      expect(res.json().items).toHaveLength(1)
      expect(res.json().items[0].name).toBe('In Cat1')
    })

    it('should search by q param', async () => {
      const category = await createCategory(app)
      await createProduct(app, category.id, { name: 'Wireless Headphones' })
      await createProduct(app, category.id, { name: 'USB Cable' })

      const res = await app.inject({
        method: 'GET',
        url: '/products?q=wireless',
      })

      expect(res.json().items).toHaveLength(1)
      expect(res.json().items[0].name).toBe('Wireless Headphones')
    })
  })

  describe('GET /products/:id', () => {
    it('should return product with category name', async () => {
      const category = await createCategory(app)
      const product = await createProduct(app, category.id)

      const res = await app.inject({
        method: 'GET',
        url: `/products/${product.id}`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().categoryName).toBeDefined()
    })

    it('should return 404 for non-existent product', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/products/00000000-0000-0000-0000-000000000000',
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe('PATCH /products/:id', () => {
    it('should update product partially', async () => {
      const category = await createCategory(app)
      const product = await createProduct(app, category.id, { price: 1000 })

      const res = await app.inject({
        method: 'PATCH',
        url: `/products/${product.id}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { price: 2000 },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().price).toBe(2000)
    })
  })

  describe('DELETE /products/:id', () => {
    it('should delete product as admin', async () => {
      const category = await createCategory(app)
      const product = await createProduct(app, category.id)

      const res = await app.inject({
        method: 'DELETE',
        url: `/products/${product.id}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      })

      expect(res.statusCode).toBe(204)
    })
  })

  describe('POST /products/validate-order', () => {
    it('should validate and decrement stock', async () => {
      const category = await createCategory(app)
      const product = await createProduct(app, category.id, {
        name: 'Headphones',
        price: 5000,
        stock: 10,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/products/validate-order',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { items: [{ productId: product.id, quantity: 3 }] },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0]).toMatchObject({
        productId: product.id,
        name: 'Headphones',
        price: 5000,
        quantity: 3,
      })

      const after = await app.inject({
        method: 'GET',
        url: `/products/${product.id}`,
      })
      expect(after.json().stock).toBe(7)
    })

    it('should return 409 for insufficient stock', async () => {
      const category = await createCategory(app)
      const product = await createProduct(app, category.id, { stock: 2 })

      const res = await app.inject({
        method: 'POST',
        url: '/products/validate-order',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { items: [{ productId: product.id, quantity: 5 }] },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().error).toBe('INSUFFICIENT_STOCK')
    })

    it('should rollback all decrements if any item fails', async () => {
      const category = await createCategory(app)
      const p1 = await createProduct(app, category.id, {
        name: 'Product A',
        stock: 10,
      })
      const p2 = await createProduct(app, category.id, {
        name: 'Product B',
        stock: 1,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/products/validate-order',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: {
          items: [
            { productId: p1.id, quantity: 5 },
            { productId: p2.id, quantity: 3 },
          ],
        },
      })

      expect(res.statusCode).toBe(409)

      const after = await app.inject({
        method: 'GET',
        url: `/products/${p1.id}`,
      })
      expect(after.json().stock).toBe(10)
    })

    it('should return 400 for empty items array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/products/validate-order',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { items: [] },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})

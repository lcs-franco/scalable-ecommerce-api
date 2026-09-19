import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { adminToken, cleanDb, createTestApp, userToken } from './helpers.js'

describe('category routes', () => {
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

  describe('POST /categories', () => {
    it('should create a category as admin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: 'Electronics' },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().name).toBe('Electronics')
      expect(res.json().id).toBeDefined()
    })

    it('should return 403 for non-admin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { name: 'Electronics' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        payload: { name: 'Electronics' },
      })

      expect(res.statusCode).toBe(401)
    })

    it('should return 400 for invalid body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: '' },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /categories', () => {
    it('should list categories without auth', async () => {
      await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: 'Books' },
      })
      await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: 'Clothing' },
      })

      const res = await app.inject({ method: 'GET', url: '/categories' })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(2)
    })
  })

  describe('PATCH /categories/:id', () => {
    it('should update category name as admin', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: 'Old Name' },
      })
      const { id } = created.json()

      const res = await app.inject({
        method: 'PATCH',
        url: `/categories/${id}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: 'New Name' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().name).toBe('New Name')
    })

    it('should return 404 for non-existent category', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/categories/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: 'Nope' },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe('DELETE /categories/:id', () => {
    it('should delete empty category', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: 'ToDelete' },
      })
      const { id } = created.json()

      const res = await app.inject({
        method: 'DELETE',
        url: `/categories/${id}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      })

      expect(res.statusCode).toBe(204)
    })

    it('should return 409 when category has products', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: 'HasProducts' },
      })
      const { id } = created.json()

      await app.inject({
        method: 'POST',
        url: '/products',
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: {
          name: 'Some Product',
          price: 100,
          stock: 1,
          categoryId: id,
        },
      })

      const res = await app.inject({
        method: 'DELETE',
        url: `/categories/${id}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().error).toBe('CATEGORY_IN_USE')
    })
  })
})

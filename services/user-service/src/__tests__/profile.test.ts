import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanDb, createTestApp } from './helpers.js'

describe('profile routes', () => {
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

  async function registerAndGetToken() {
    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        email: 'profile@example.com',
        password: 'password123',
        name: 'Profile User',
      },
    })
    return res.json().accessToken as string
  }

  describe('GET /profile', () => {
    it('should return the authenticated user profile', async () => {
      const token = await registerAndGetToken()

      const res = await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.email).toBe('profile@example.com')
      expect(body.name).toBe('Profile User')
      expect(body.role).toBe('user')
      expect(body).not.toHaveProperty('passwordHash')
    })

    it('should return 401 without auth token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/profile',
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('PATCH /profile', () => {
    it('should update the user name', async () => {
      const token = await registerAndGetToken()

      const res = await app.inject({
        method: 'PATCH',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Name' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().name).toBe('Updated Name')

      // Verify persistence
      const profileRes = await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(profileRes.json().name).toBe('Updated Name')
    })

    it('should return 401 without auth token', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/profile',
        payload: { name: 'Hacker' },
      })

      expect(res.statusCode).toBe(401)
    })
  })
})

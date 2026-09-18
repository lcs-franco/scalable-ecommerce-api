import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanDb, createTestApp } from './helpers.js'

describe('auth routes', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app']
  let db: Awaited<ReturnType<typeof createTestApp>>['db']
  let pool: Awaited<ReturnType<typeof createTestApp>>['pool']
  let publishedEvents: Awaited<
    ReturnType<typeof createTestApp>
  >['publishedEvents']

  beforeAll(async () => {
    const ctx = await createTestApp()
    app = ctx.app
    db = ctx.db
    pool = ctx.pool
    publishedEvents = ctx.publishedEvents
  })

  afterEach(async () => {
    await cleanDb(db)
    publishedEvents.length = 0
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  describe('POST /register', () => {
    it('should register a new user and return tokens', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.accessToken).toBeDefined()
      expect(body.refreshToken).toBeDefined()
    })

    it('should publish user.registered event', async () => {
      await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        },
      })

      expect(publishedEvents).toHaveLength(1)
      expect(publishedEvents[0]).toMatchObject({
        email: 'test@example.com',
        name: 'Test User',
      })
    })

    it('should return 409 for duplicate email', async () => {
      const payload = {
        email: 'dup@example.com',
        password: 'password123',
        name: 'User',
      }

      await app.inject({ method: 'POST', url: '/register', payload })
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload,
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().error).toBe('EMAIL_ALREADY_IN_USE')
    })

    it('should return 400 for invalid body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'not-an-email', password: '123' },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /login', () => {
    it('should login with valid credentials', async () => {
      await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'login@example.com',
          password: 'password123',
          name: 'Login User',
        },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'login@example.com', password: 'password123' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.accessToken).toBeDefined()
      expect(body.refreshToken).toBeDefined()
    })

    it('should return 401 for wrong password', async () => {
      await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'wrong@example.com',
          password: 'password123',
          name: 'User',
        },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'wrong@example.com', password: 'wrongpass' },
      })

      expect(res.statusCode).toBe(401)
      expect(res.json().error).toBe('INVALID_CREDENTIALS')
    })

    it('should return 401 for non-existent email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'ghost@example.com', password: 'password123' },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /refresh', () => {
    it('should return new tokens with valid refresh token', async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'refresh@example.com',
          password: 'password123',
          name: 'User',
        },
      })
      const { refreshToken } = registerRes.json()

      const res = await app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.accessToken).toBeDefined()
      expect(body.refreshToken).toBeDefined()
      expect(body.refreshToken).not.toBe(refreshToken)
    })

    it('should reject used refresh token (rotation)', async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'rotate@example.com',
          password: 'password123',
          name: 'User',
        },
      })
      const { refreshToken } = registerRes.json()

      // Use it once
      await app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken },
      })

      // Try to use it again
      const res = await app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /logout', () => {
    it('should invalidate refresh tokens', async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'logout@example.com',
          password: 'password123',
          name: 'User',
        },
      })
      const { accessToken, refreshToken } = registerRes.json()

      const logoutRes = await app.inject({
        method: 'POST',
        url: '/logout',
        headers: { authorization: `Bearer ${accessToken}` },
      })

      expect(logoutRes.statusCode).toBe(204)

      // Refresh token should no longer work
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken },
      })

      expect(refreshRes.statusCode).toBe(401)
    })

    it('should return 401 without auth token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/logout',
      })

      expect(res.statusCode).toBe(401)
    })
  })
})

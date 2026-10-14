import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanRedis,
  createRedis,
  createTestApp,
  startUpstreams,
  token,
} from './helpers.js'

let app: FastifyInstance
let redis: Redis
let closeUpstreams: () => Promise<unknown>

beforeAll(async () => {
  redis = createRedis()
  const started = await startUpstreams()
  closeUpstreams = started.close
  app = await createTestApp({ redis, upstreams: started.upstreams })
})

beforeEach(() => cleanRedis(redis))

afterAll(async () => {
  await app.close()
  await closeUpstreams()
  redis.disconnect()
})

const bearer = (value: string) => ({ authorization: `Bearer ${value}` })

describe('access control', () => {
  it.each([
    ['POST', '/api/auth/register'],
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/refresh'],
    ['GET', '/api/products'],
    ['GET', '/api/products/p1'],
    ['GET', '/api/categories'],
  ])('%s %s is public', async (method, url) => {
    const res = await app.inject({ method: method as 'GET', url })

    expect(res.statusCode).toBe(200)
  })

  it('serves a public route even with an invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/products',
      headers: bearer('garbage'),
    })

    expect(res.statusCode).toBe(200)
  })

  it('rejects a protected route without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/cart' })

    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'UNAUTHORIZED' })
  })

  it('rejects an invalid or expired token with the reason', async () => {
    const expired = app.jwt.sign(
      { userId: 'u1', email: 'u1@test.com', role: 'user' },
      { expiresIn: '15m', clockTimestamp: Date.now() - 3_600_000 },
    )

    const invalid = await app.inject({
      method: 'GET',
      url: '/api/cart',
      headers: bearer('garbage'),
    })
    const late = await app.inject({
      method: 'GET',
      url: '/api/cart',
      headers: bearer(expired),
    })

    expect(invalid.statusCode).toBe(401)
    expect(late.statusCode).toBe(401)
    expect(late.json().message).toMatch(/expired/i)
  })

  it.each([
    ['POST', '/api/products'],
    ['PATCH', '/api/products/p1'],
    ['DELETE', '/api/products/p1'],
    ['POST', '/api/categories'],
    ['PATCH', '/api/categories/c1'],
    ['DELETE', '/api/categories/c1'],
    ['PATCH', '/api/orders/o1/status'],
  ])('%s %s is admin only', async (method, url) => {
    const asUser = await app.inject({
      method: method as 'GET',
      url,
      headers: bearer(token(app, 'user')),
    })
    const asAdmin = await app.inject({
      method: method as 'GET',
      url,
      headers: bearer(token(app, 'admin')),
    })
    const anonymous = await app.inject({ method: method as 'GET', url })

    expect(asUser.statusCode).toBe(403)
    expect(asUser.json()).toMatchObject({ error: 'FORBIDDEN' })
    expect(asAdmin.statusCode).toBe(200)
    expect(anonymous.statusCode).toBe(401)
  })

  it('serves /health without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})

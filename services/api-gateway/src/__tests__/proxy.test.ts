import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Upstreams } from '../routes/table.js'
import {
  cleanRedis,
  createRedis,
  createTestApp,
  type IEcho,
  startUpstreams,
  token,
} from './helpers.js'

let app: FastifyInstance
let redis: Redis
let upstreams: Upstreams
let closeUpstreams: () => Promise<unknown>

beforeAll(async () => {
  redis = createRedis()
  ;({ upstreams, close: closeUpstreams } = await startUpstreams())
  app = await createTestApp({ redis, upstreams })
})

beforeEach(() => cleanRedis(redis))

afterAll(async () => {
  await app.close()
  await closeUpstreams()
  redis.disconnect()
})

describe('routing', () => {
  it.each([
    ['POST', '/api/auth/login', 'user', '/login'],
    ['GET', '/api/auth/profile', 'user', '/profile'],
    [
      'GET',
      '/api/products?page=2&limit=5',
      'product',
      '/products?page=2&limit=5',
    ],
    ['GET', '/api/products/p1', 'product', '/products/p1'],
    ['GET', '/api/categories', 'product', '/categories'],
    ['GET', '/api/cart', 'cart', '/cart'],
    ['DELETE', '/api/cart/items/p1', 'cart', '/cart/items/p1'],
    ['POST', '/api/orders', 'order', '/orders'],
    ['GET', '/api/orders/o1', 'order', '/orders/o1'],
    ['GET', '/api/payments/order/o1', 'payment', '/payments/order/o1'],
  ])('%s %s → %s-service %s', async (method, url, upstream, upstreamUrl) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      headers: { authorization: `Bearer ${token(app)}` },
    })

    expect(res.statusCode).toBe(200)
    const echo = res.json<IEcho>()
    expect(echo).toMatchObject({ upstream, method, url: upstreamUrl })
  })

  it('streams the request body untouched, whatever the content type', async () => {
    const json = '{"email":"a@b.com",  "password":"x"}'
    const text = 'not json at all'

    const resJson = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: json,
    })
    const resText = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'text/plain' },
      payload: text,
    })

    expect(resJson.json<IEcho>().body).toBe(json)
    expect(resText.json<IEcho>().body).toBe(text)
  })

  it.each([
    ['GET', '/api/unknown'],
    ['GET', '/products'],
    ['PUT', '/api/products/p1'],
    ['POST', '/api/products/validate-order'],
    ['POST', '/api/products/restore-stock'],
    ['POST', '/api/cart/checkout'],
  ])('%s %s is not exposed → 404', async (method, url) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      headers: { authorization: `Bearer ${token(app, 'admin')}` },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ error: 'NOT_FOUND' })
  })
})

describe('headers', () => {
  it('forwards Authorization and the identity of a valid token', async () => {
    const bearer = `Bearer ${token(app, 'admin', 'admin-1')}`

    const res = await app.inject({
      method: 'GET',
      url: '/api/orders',
      headers: { authorization: bearer },
    })

    expect(res.json<IEcho>().headers).toMatchObject({
      authorization: bearer,
      'x-user-id': 'admin-1',
      'x-user-role': 'admin',
    })
  })

  it('drops identity and internal headers sent by the client', async () => {
    const forged = {
      'x-user-id': 'victim',
      'x-user-role': 'admin',
      'x-internal-token': 'guess',
    }

    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/products',
      headers: forged,
    })
    const authenticated = await app.inject({
      method: 'GET',
      url: '/api/cart',
      headers: {
        ...forged,
        authorization: `Bearer ${token(app, 'user', 'u1')}`,
      },
    })

    const anonymousHeaders = anonymous.json<IEcho>().headers
    expect(anonymousHeaders['x-user-id']).toBeUndefined()
    expect(anonymousHeaders['x-user-role']).toBeUndefined()
    expect(anonymousHeaders['x-internal-token']).toBeUndefined()
    expect(authenticated.json<IEcho>().headers).toMatchObject({
      'x-user-id': 'u1',
      'x-user-role': 'user',
    })
    expect(
      authenticated.json<IEcho>().headers['x-internal-token'],
    ).toBeUndefined()
  })

  it('generates a request id, forwards it and returns it', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/products' })

    const id = res.headers['x-request-id']
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.json<IEcho>().headers['x-request-id']).toBe(id)
  })

  it('reuses a client request id only when it is a UUID', async () => {
    const uuid = '6f1c1c5e-2a7b-4c1e-9d3a-0b8f2e4a7c11'

    const reused = await app.inject({
      method: 'GET',
      url: '/api/products',
      headers: { 'x-request-id': uuid },
    })
    const replaced = await app.inject({
      method: 'GET',
      url: '/api/products',
      headers: { 'x-request-id': 'not-a-uuid' },
    })

    expect(reused.headers['x-request-id']).toBe(uuid)
    expect(reused.json<IEcho>().headers['x-request-id']).toBe(uuid)
    expect(replaced.headers['x-request-id']).not.toBe('not-a-uuid')
  })
})

describe('upstream failures', () => {
  it('returns 502 when the upstream is unreachable', async () => {
    const down = await createTestApp({
      redis,
      upstreams: { ...upstreams, product: 'http://127.0.0.1:1' },
    })

    const res = await down.inject({ method: 'GET', url: '/api/products' })
    await down.close()

    expect(res.statusCode).toBe(502)
    expect(res.json()).toMatchObject({ error: 'BAD_GATEWAY' })
  })

  it('returns 504 when the upstream times out', async () => {
    const slow = await createTestApp({
      redis,
      upstreams,
      upstreamTimeoutMs: 100,
    })

    // undici checks timeouts on a ~1s coarse timer, so the delay must exceed it
    const res = await slow.inject({
      method: 'GET',
      url: '/api/products?delayMs=3000',
    })
    await slow.close()

    expect(res.statusCode).toBe(504)
    expect(res.json()).toMatchObject({ error: 'GATEWAY_TIMEOUT' })
  })
})

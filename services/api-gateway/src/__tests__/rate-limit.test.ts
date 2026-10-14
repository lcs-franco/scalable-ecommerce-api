import type { FastifyInstance } from 'fastify'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Upstreams } from '../routes/table.js'
import {
  cleanRedis,
  createRedis,
  createTestApp,
  startUpstreams,
  token,
} from './helpers.js'

const WINDOW_MS = 60_000
const T0 = WINDOW_MS * 1_000_000

let app: FastifyInstance
let redis: Redis
let upstreams: Upstreams
let closeUpstreams: () => Promise<unknown>
let clock = T0

beforeAll(async () => {
  redis = createRedis()
  ;({ upstreams, close: closeUpstreams } = await startUpstreams())
  app = await createTestApp({
    redis,
    upstreams,
    now: () => clock,
    rateLimits: { anonymous: 3, authenticated: 5 },
  })
})

beforeEach(async () => {
  clock = T0
  await cleanRedis(redis)
})

afterAll(async () => {
  await app.close()
  await closeUpstreams()
  redis.disconnect()
})

function get(url: string, opts: { ip?: string; bearer?: string } = {}) {
  return app.inject({
    method: 'GET',
    url,
    remoteAddress: opts.ip ?? '10.0.0.1',
    headers: opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {},
  })
}

async function times(n: number, request: () => ReturnType<typeof get>) {
  const responses = []
  for (let i = 0; i < n; i++) responses.push(await request())
  return responses
}

describe('rate limiting', () => {
  it('limits anonymous requests by IP and reports it in headers', async () => {
    const responses = await times(4, () => get('/api/products'))

    expect(responses.map((r) => r.statusCode)).toEqual([200, 200, 200, 429])
    expect(responses.map((r) => r.headers['x-ratelimit-remaining'])).toEqual([
      '2',
      '1',
      '0',
      '0',
    ])
    expect(responses[0].headers['x-ratelimit-limit']).toBe('3')
    expect(responses[0].headers['x-ratelimit-reset']).toBe('60')

    const limited = responses[3]
    expect(limited.json()).toMatchObject({ error: 'TOO_MANY_REQUESTS' })
    expect(limited.headers['retry-after']).toBe('60')
  })

  it('keeps separate counters per IP', async () => {
    await times(3, () => get('/api/products', { ip: '10.0.0.1' }))

    const other = await get('/api/products', { ip: '10.0.0.2' })

    expect(other.statusCode).toBe(200)
  })

  it('limits authenticated requests by user, across IPs', async () => {
    const bearer = token(app, 'user', 'u1')

    const responses = await times(6, () =>
      get('/api/cart', { bearer, ip: `10.0.1.${(Math.random() * 250) | 0}` }),
    )
    const otherUser = await get('/api/cart', {
      bearer: token(app, 'user', 'u2'),
    })

    expect(responses.map((r) => r.statusCode)).toEqual([
      200, 200, 200, 200, 200, 429,
    ])
    expect(responses[0].headers['x-ratelimit-limit']).toBe('5')
    expect(otherUser.statusCode).toBe(200)
  })

  it('counts invalid tokens against the IP before rejecting them', async () => {
    const responses = await times(4, () =>
      get('/api/cart', { bearer: 'garbage' }),
    )

    expect(responses.map((r) => r.statusCode)).toEqual([401, 401, 401, 429])
  })

  it('counts requests to unknown routes', async () => {
    const responses = await times(4, () => get('/api/unknown'))

    expect(responses.map((r) => r.statusCode)).toEqual([404, 404, 404, 429])
  })

  it('does not limit /health', async () => {
    const responses = await times(5, () => get('/health'))

    expect(responses.every((r) => r.statusCode === 200)).toBe(true)
    expect(responses[0].headers['x-ratelimit-limit']).toBeUndefined()
  })

  it('slides: previous window hits fade as the current one advances', async () => {
    await times(4, () => get('/api/products'))

    clock = T0 + WINDOW_MS * 1.5
    const responses = await times(2, () => get('/api/products'))

    expect(responses.map((r) => r.statusCode)).toEqual([200, 429])
    expect(responses[0].headers['x-ratelimit-reset']).toBe('30')
  })

  it('fails open when Redis is unavailable', async () => {
    const broken = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    })
    broken.on('error', () => {})
    const unprotected = await createTestApp({ redis: broken, upstreams })

    const res = await unprotected.inject({
      method: 'GET',
      url: '/api/products',
    })
    await unprotected.close()
    broken.disconnect()

    expect(res.statusCode).toBe(200)
    expect(res.headers['x-ratelimit-limit']).toBeUndefined()
  })
})

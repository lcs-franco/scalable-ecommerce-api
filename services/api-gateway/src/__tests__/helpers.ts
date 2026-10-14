import Fastify, { type FastifyInstance } from 'fastify'
import { Redis } from 'ioredis'
import { buildApp } from '../app.js'
import type { UpstreamName, Upstreams } from '../routes/table.js'

export const JWT_SECRET = 'test-secret-must-be-at-least-32-chars!'
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380'

export const UPSTREAM_NAMES: UpstreamName[] = [
  'user',
  'product',
  'cart',
  'order',
  'payment',
]

export interface IEcho {
  upstream: UpstreamName
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

async function startEchoServer(upstream: UpstreamName) {
  const server = Fastify()
  server.removeAllContentTypeParsers()
  server.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) =>
    done(null, body),
  )
  server.all('/*', async (request, reply) => {
    const { delayMs } = request.query as { delayMs?: string }
    if (delayMs) await new Promise((r) => setTimeout(r, Number(delayMs)))
    const echo: IEcho = {
      upstream,
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: (request.body as string | undefined) ?? '',
    }
    return reply.status(200).send(echo)
  })
  await server.listen({ port: 0, host: '127.0.0.1' })
  const { port } = server.server.address() as { port: number }
  return { server, url: `http://127.0.0.1:${port}` }
}

export async function startUpstreams() {
  const started = await Promise.all(UPSTREAM_NAMES.map(startEchoServer))
  const upstreams = Object.fromEntries(
    UPSTREAM_NAMES.map((name, i) => [name, started[i].url]),
  ) as Upstreams
  const close = () => Promise.all(started.map(({ server }) => server.close()))
  return { upstreams, close }
}

export function createRedis() {
  return new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 3 })
}

export async function createTestApp(opts: {
  redis: Redis
  upstreams: Upstreams
  now?: () => number
  rateLimits?: { anonymous: number; authenticated: number }
  upstreamTimeoutMs?: number
}) {
  const app = await buildApp({
    redis: opts.redis,
    upstreams: opts.upstreams,
    jwtSecret: JWT_SECRET,
    rateLimits: opts.rateLimits ?? { anonymous: 1000, authenticated: 1000 },
    upstreamTimeoutMs: opts.upstreamTimeoutMs ?? 2000,
    now: opts.now,
  })
  await app.ready()
  return app
}

export function token(
  app: FastifyInstance,
  role: 'user' | 'admin' = 'user',
  userId = 'user-id',
) {
  return app.jwt.sign({ userId, email: `${userId}@test.com`, role })
}

export async function cleanRedis(redis: Redis) {
  const keys = await redis.keys('ratelimit:*')
  if (keys.length > 0) await redis.del(...keys)
}

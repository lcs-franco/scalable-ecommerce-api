import { getLoggerConfig } from '@ecommerce/logger'
import { randomUUID } from 'node:crypto'
import Fastify, { FastifyError } from 'fastify'
import type { Redis } from 'ioredis'
import { ErrorCode, HttpError, RouteNotFound } from './errors/index.js'
import { registerAccessCheck } from './hooks/access.js'
import { registerIdentity } from './hooks/identity.js'
import { registerProxy } from './hooks/proxy.js'
import { registerRateLimit, type IRateLimits } from './hooks/rate-limit.js'
import { createRateLimiter } from './rate-limit/rate-limiter.js'
import type { Upstreams } from './routes/table.js'
import './types.js'

const RATE_LIMIT_WINDOW_MS = 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface IBuildAppOptions {
  redis: Redis
  upstreams: Upstreams
  jwtSecret: string
  rateLimits: IRateLimits
  upstreamTimeoutMs: number
  trustProxy?: boolean
  now?: () => number
}

export async function buildApp(opts: IBuildAppOptions) {
  const app = Fastify({
    logger: getLoggerConfig({ service: 'api-gateway', level: 'warn' }),
    trustProxy: opts.trustProxy ?? false,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id']
      return typeof incoming === 'string' && UUID.test(incoming)
        ? incoming
        : randomUUID()
    },
  })

  app.setErrorHandler((error: FastifyError | HttpError, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      })
    }

    app.log.error(error)
    return reply.status(500).send({
      error: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    })
  })

  app.setNotFoundHandler((request) => {
    throw new RouteNotFound(request.method, request.url)
  })

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  // Hook order is the pipeline: identity → rate limit → access → proxy
  await registerIdentity(app, { jwtSecret: opts.jwtSecret })
  registerRateLimit(app, {
    limiter: createRateLimiter(opts.redis, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      now: opts.now,
    }),
    limits: opts.rateLimits,
  })
  registerAccessCheck(app)

  app.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
  }))

  await registerProxy(app, {
    upstreams: opts.upstreams,
    timeoutMs: opts.upstreamTimeoutMs,
  })

  return app
}

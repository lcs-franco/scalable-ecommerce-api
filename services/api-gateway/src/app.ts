import {
  CommonErrorCode,
  genRequestId,
  HttpError,
  registerRequestId,
} from '@ecommerce/http'
import Fastify, { type FastifyBaseLogger, FastifyError } from 'fastify'
import type { Redis } from 'ioredis'
import { RouteNotFound } from './errors/index.js'
import { registerAccessCheck } from './hooks/access.js'
import { registerIdentity } from './hooks/identity.js'
import { registerProxy } from './hooks/proxy.js'
import { registerRateLimit, type IRateLimits } from './hooks/rate-limit.js'
import { createRateLimiter } from './rate-limit/rate-limiter.js'
import type { Upstreams } from './routes/table.js'
import './types.js'

const RATE_LIMIT_WINDOW_MS = 60_000

interface IBuildAppOptions {
  logger: FastifyBaseLogger
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
    loggerInstance: opts.logger,
    trustProxy: opts.trustProxy ?? false,
    genReqId: genRequestId,
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
      error: CommonErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    })
  })

  app.setNotFoundHandler((request) => {
    throw new RouteNotFound(request.method, request.url)
  })

  registerRequestId(app)

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

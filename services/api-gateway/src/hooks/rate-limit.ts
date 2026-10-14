import type { FastifyInstance } from 'fastify'
import { TooManyRequests } from '../errors/index.js'
import type { IRateLimiter } from '../rate-limit/rate-limiter.js'

export interface IRateLimits {
  anonymous: number
  authenticated: number
}

export function registerRateLimit(
  app: FastifyInstance,
  opts: { limiter: IRateLimiter; limits: IRateLimits },
) {
  app.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.config.rateLimit === false) return

    const { identity } = request
    const [key, limit] = identity
      ? [`ratelimit:user:${identity.userId}`, opts.limits.authenticated]
      : [`ratelimit:ip:${request.ip}`, opts.limits.anonymous]

    let result
    try {
      result = await opts.limiter.hit(key, limit)
    } catch (err) {
      request.log.warn({ err }, 'rate limiter unavailable, request allowed')
      return
    }

    const resetSeconds = Math.ceil(result.resetMs / 1000)
    reply.headers({
      'x-ratelimit-limit': result.limit,
      'x-ratelimit-remaining': result.remaining,
      'x-ratelimit-reset': resetSeconds,
    })

    if (!result.allowed) {
      reply.header('retry-after', resetSeconds)
      throw new TooManyRequests()
    }
  })
}

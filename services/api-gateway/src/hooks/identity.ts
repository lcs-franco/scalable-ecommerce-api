import fastifyJwt from '@fastify/jwt'
import type { FastifyInstance } from 'fastify'

// Never rejects: the rate limiter needs the identity first, and the access
// check decides later whether a missing one is a 401.
export async function registerIdentity(
  app: FastifyInstance,
  opts: { jwtSecret: string },
) {
  await app.register(fastifyJwt, { secret: opts.jwtSecret })
  app.decorateRequest('identity', null)
  app.decorateRequest('authError', null)

  app.addHook('onRequest', async (request) => {
    if (!request.headers.authorization) return
    try {
      await request.jwtVerify()
      request.identity = request.user
    } catch (err) {
      request.authError = (err as Error).message
    }
  })
}

import type { FastifyInstance } from 'fastify'
import { Forbidden, Unauthorized } from '../errors/index.js'

export function registerAccessCheck(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    const { access } = request.routeOptions.config
    if (!access || access === 'public') return

    if (!request.identity) {
      throw new Unauthorized(request.authError ?? undefined)
    }
    if (access === 'admin' && request.identity.role !== 'admin') {
      throw new Forbidden()
    }
  })
}

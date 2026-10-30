import { genRequestId, registerRequestId } from '@ecommerce/http'
import Fastify, { type FastifyBaseLogger } from 'fastify'

interface IBuildAppOptions {
  logger: FastifyBaseLogger
}

export async function buildApp(opts: IBuildAppOptions) {
  const app = Fastify({
    loggerInstance: opts.logger,
    genReqId: genRequestId,
  })

  registerRequestId(app)

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}

import { genRequestId, registerRequestId } from '@ecommerce/http'
import { metricsPlugin } from '@ecommerce/metrics'
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
  await app.register(metricsPlugin)

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}

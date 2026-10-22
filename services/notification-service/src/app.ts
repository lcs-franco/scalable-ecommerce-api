import Fastify, { type FastifyBaseLogger } from 'fastify'

interface IBuildAppOptions {
  logger: FastifyBaseLogger
}

export async function buildApp(opts: IBuildAppOptions) {
  const app = Fastify({
    loggerInstance: opts.logger,
  })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}

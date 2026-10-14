import { getLoggerConfig } from '@ecommerce/logger'
import Fastify from 'fastify'

export async function buildApp() {
  const app = Fastify({
    logger: getLoggerConfig({ service: 'notification-service', level: 'warn' }),
  })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}

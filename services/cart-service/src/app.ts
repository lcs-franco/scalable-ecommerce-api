import { authPlugin } from '@ecommerce/auth'
import { DOCS_PREFIX, docsPlugin } from '@ecommerce/docs'
import { registerErrorHandler } from '@ecommerce/http'
import Fastify, { type FastifyBaseLogger } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import type { RedisClient } from './redis.js'
import { cartRoutes } from './routes/cart/cart.routes.js'
import { createCartService } from './services/cart.service.js'
import { createProductClient } from './services/product.client.js'

interface IBuildAppOptions {
  logger: FastifyBaseLogger
  redis: RedisClient
  productServiceUrl: string
  internalServiceToken: string
}

export async function buildApp(opts: IBuildAppOptions) {
  const app = Fastify({
    loggerInstance: opts.logger,
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  registerErrorHandler(app)

  await app.register(docsPlugin, { title: 'cart-service' })
  await app.register(authPlugin, {
    publicPrefixes: [DOCS_PREFIX],
    internalToken: opts.internalServiceToken,
  })

  app.get(
    '/health',
    { config: { skipAuth: true }, schema: { hide: true } },
    async () => ({ status: 'ok' }),
  )

  const cartService = createCartService(opts.redis)
  const productClient = createProductClient(opts.productServiceUrl)

  await app.register(async (instance) => {
    await cartRoutes(instance, { cartService, productClient })
  })

  return app
}

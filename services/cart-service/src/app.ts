import { createServiceApp } from '@ecommerce/service'
import type { FastifyBaseLogger } from 'fastify'
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
  const app = await createServiceApp({
    name: 'cart-service',
    logger: opts.logger,
    internalToken: opts.internalServiceToken,
  })

  const cartService = createCartService(opts.redis)
  const productClient = createProductClient(opts.productServiceUrl)

  await app.register(async (instance) => {
    await cartRoutes(instance, { cartService, productClient })
  })

  return app
}

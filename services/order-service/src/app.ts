import { authPlugin } from '@ecommerce/auth'
import { DOCS_PREFIX, docsPlugin } from '@ecommerce/docs'
import { registerErrorHandler } from '@ecommerce/http'
import Fastify, { type FastifyBaseLogger } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import type { createCartClient } from './clients/cart.client.js'
import type { createProductClient } from './clients/product.client.js'
import { saga } from './config/saga.js'
import type { Db } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { orderRoutes } from './routes/orders/order.routes.js'
import {
  createOrderService,
  type OrderService,
} from './services/order.service.js'

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyInstance {
    orderService: OrderService
  }
}

interface IBuildAppOptions {
  logger: FastifyBaseLogger
  db: Db
  cartClient: ReturnType<typeof createCartClient>
  productClient: ReturnType<typeof createProductClient>
  createSaga: typeof saga
}

export async function buildApp(opts: IBuildAppOptions) {
  const { cartClient, db, productClient, createSaga } = opts

  const app = Fastify({
    loggerInstance: opts.logger,
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await runMigrations(db)

  registerErrorHandler(app)

  await app.register(docsPlugin, { title: 'order-service' })
  await app.register(authPlugin, { publicPrefixes: [DOCS_PREFIX] })

  app.get(
    '/health',
    { config: { skipAuth: true }, schema: { hide: true } },
    async () => ({ status: 'ok' }),
  )

  app.decorate(
    'orderService',
    createOrderService({ db, cartClient, productClient, createSaga }),
  )

  await app.register(orderRoutes)

  return app
}

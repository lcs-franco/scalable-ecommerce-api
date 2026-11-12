import { runMigrations } from '@ecommerce/db'
import { createServiceApp } from '@ecommerce/service'
import type { FastifyBaseLogger } from 'fastify'
import type { createCartClient } from './clients/cart.client.js'
import type { createProductClient } from './clients/product.client.js'
import { saga } from './config/saga.js'
import { MIGRATIONS_FOLDER, type Db } from './db/index.js'
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

  await runMigrations(db, MIGRATIONS_FOLDER)

  const app = await createServiceApp({
    name: 'order-service',
    logger: opts.logger,
  })

  app.decorate(
    'orderService',
    createOrderService({ db, cartClient, productClient, createSaga }),
  )

  await app.register(orderRoutes)

  return app
}

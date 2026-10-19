import { authPlugin } from '@ecommerce/auth'
import { DOCS_PREFIX, docsPlugin } from '@ecommerce/docs'
import type { EventData, Topics } from '@ecommerce/events'
import { getLoggerConfig } from '@ecommerce/logger'
import Fastify, { FastifyError } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { ZodError } from 'zod'
import type { createCartClient } from './clients/cart.client.js'
import type { createProductClient } from './clients/product.client.js'
import { saga } from './config/saga.js'
import type { Db } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { ApplicationError, ErrorCode } from './errors/index.js'
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
  db: Db
  cartClient: ReturnType<typeof createCartClient>
  productClient: ReturnType<typeof createProductClient>
  publishOrderPlaced: (
    data: EventData<typeof Topics.ORDER_PLACED>,
  ) => Promise<void>
  publishOrderStatusChanged: (
    data: EventData<typeof Topics.ORDER_STATUS_CHANGED>,
  ) => Promise<void>
  createSaga: typeof saga
}

export async function buildApp(opts: IBuildAppOptions) {
  const {
    cartClient,
    db,
    productClient,
    publishOrderPlaced,
    publishOrderStatusChanged,
    createSaga,
  } = opts

  const app = Fastify({
    logger: getLoggerConfig({ service: 'order-service', level: 'warn' }),
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await runMigrations(db)

  app.setErrorHandler(
    (error: FastifyError | ApplicationError, _request, reply) => {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: ErrorCode.VALIDATION,
          message: error.message,
        })
      }

      if (error instanceof ApplicationError) {
        return reply.status(error.statusCode).send({
          error: error.code,
          message: error.message,
        })
      }

      const statusCode = error.statusCode ?? 500
      if (statusCode < 500) {
        return reply.status(statusCode).send({
          error: error.message,
          message: error.message,
        })
      }

      app.log.error(error)
      return reply.status(500).send({
        error: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      })
    },
  )

  await app.register(docsPlugin, { title: 'order-service' })
  await app.register(authPlugin, { publicPrefixes: [DOCS_PREFIX] })

  app.get(
    '/health',
    { config: { skipAuth: true }, schema: { hide: true } },
    async () => ({ status: 'ok' }),
  )

  app.decorate(
    'orderService',
    createOrderService({
      db,
      cartClient,
      productClient,
      publishOrderPlaced,
      publishOrderStatusChanged,
      createSaga,
    }),
  )

  await app.register(orderRoutes)

  return app
}

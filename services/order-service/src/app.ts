import { authPlugin } from '@ecommerce/auth'
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
import { createOrderService } from './services/order.service.js'

interface IBuildAppOptions {
  db: Db
  cartClient: ReturnType<typeof createCartClient>
  productClient: ReturnType<typeof createProductClient>
  publishOrderPlaced: (data: {
    orderId: string
    userId: string
    items: { productId: string; quantity: number; price: number }[]
    total: number
  }) => Promise<void>
  publishOrderStatusChanged: (data: {
    orderId: string
    status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled'
  }) => Promise<void>
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

  await app.register(authPlugin)

  const orderService = createOrderService({
    db,
    cartClient,
    productClient,
    publishOrderPlaced,
    publishOrderStatusChanged,
    createSaga,
  })

  await app.register(async (instance) => {
    await orderRoutes(instance, { orderService })
  })

  return { app, orderService }
}

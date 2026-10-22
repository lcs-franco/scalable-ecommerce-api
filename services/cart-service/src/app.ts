import { authPlugin } from '@ecommerce/auth'
import { DOCS_PREFIX, docsPlugin } from '@ecommerce/docs'
import Fastify, { type FastifyBaseLogger, FastifyError } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { ZodError } from 'zod'
import { ApplicationError, ErrorCode } from './errors/index.js'
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

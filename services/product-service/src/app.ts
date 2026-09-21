import { authPlugin } from '@ecommerce/auth'
import { getLoggerConfig } from '@ecommerce/logger'
import Fastify, { FastifyError } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { ZodError } from 'zod'
import type { Db } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { ApplicationError, ErrorCode } from './errors/index.js'
import { categoryRoutes } from './routes/categories/category.routes.js'
import { productRoutes } from './routes/products/product.routes.js'
import { createCategoryService } from './services/category.service.js'
import { createProductService } from './services/product.service.js'

interface IBuildAppOptions {
  db: Db
}

export async function buildApp(opts: IBuildAppOptions) {
  const app = Fastify({
    logger: getLoggerConfig({ service: 'product-service', level: 'warn' }),
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await runMigrations(opts.db)

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

  const categoryService = createCategoryService(opts.db)
  const productService = createProductService(opts.db)

  await app.register(async (instance) => {
    await categoryRoutes(instance, { categoryService })
    await productRoutes(instance, { productService })
  })

  return app
}

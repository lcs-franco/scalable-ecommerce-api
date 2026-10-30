import { authPlugin } from '@ecommerce/auth'
import { DOCS_PREFIX, docsPlugin } from '@ecommerce/docs'
import { registerErrorHandler } from '@ecommerce/http'
import Fastify, { type FastifyBaseLogger } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import type { Db } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { categoryRoutes } from './routes/categories/category.routes.js'
import { productRoutes } from './routes/products/product.routes.js'
import { createCategoryService } from './services/category.service.js'
import { createProductService } from './services/product.service.js'

interface IBuildAppOptions {
  logger: FastifyBaseLogger
  db: Db
  internalServiceToken: string
}

export async function buildApp(opts: IBuildAppOptions) {
  const app = Fastify({
    loggerInstance: opts.logger,
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await runMigrations(opts.db)

  registerErrorHandler(app)

  await app.register(docsPlugin, { title: 'product-service' })
  await app.register(authPlugin, {
    publicPrefixes: [DOCS_PREFIX],
    internalToken: opts.internalServiceToken,
  })

  app.get(
    '/health',
    { config: { skipAuth: true }, schema: { hide: true } },
    async () => ({ status: 'ok' }),
  )

  const categoryService = createCategoryService(opts.db)
  const productService = createProductService(opts.db)

  await app.register(async (instance) => {
    await categoryRoutes(instance, { categoryService })
    await productRoutes(instance, { productService })
  })

  return app
}

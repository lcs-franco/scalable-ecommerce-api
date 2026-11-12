import { runMigrations } from '@ecommerce/db'
import { createServiceApp } from '@ecommerce/service'
import type { FastifyBaseLogger } from 'fastify'
import { MIGRATIONS_FOLDER, type Db } from './db/index.js'
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
  await runMigrations(opts.db, MIGRATIONS_FOLDER)

  const app = await createServiceApp({
    name: 'product-service',
    logger: opts.logger,
    internalToken: opts.internalServiceToken,
  })

  const categoryService = createCategoryService(opts.db)
  const productService = createProductService(opts.db)

  await app.register(async (instance) => {
    await categoryRoutes(instance, { categoryService })
    await productRoutes(instance, { productService })
  })

  return app
}

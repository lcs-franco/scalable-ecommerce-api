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
import type { IPaymentProcessor } from './payments/payment-processor.js'
import { paymentRoutes } from './routes/payments/payment.routes.js'
import {
  createPaymentService,
  type PaymentService,
} from './services/payment.service.js'

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyInstance {
    paymentService: PaymentService
  }
}

interface IBuildAppOptions {
  logger: FastifyBaseLogger
  db: Db
  processor: IPaymentProcessor
}

export async function buildApp(opts: IBuildAppOptions) {
  const { db, processor } = opts

  const app = Fastify({
    loggerInstance: opts.logger,
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await runMigrations(db)

  registerErrorHandler(app)

  await app.register(docsPlugin, { title: 'payment-service' })
  await app.register(authPlugin, { publicPrefixes: [DOCS_PREFIX] })

  app.get(
    '/health',
    { config: { skipAuth: true }, schema: { hide: true } },
    async () => ({ status: 'ok' }),
  )

  app.decorate('paymentService', createPaymentService({ db, processor }))

  await app.register(paymentRoutes)

  return app
}

import { runMigrations } from '@ecommerce/db'
import { createServiceApp } from '@ecommerce/service'
import type { FastifyBaseLogger } from 'fastify'
import { MIGRATIONS_FOLDER, type Db } from './db/index.js'
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

  await runMigrations(db, MIGRATIONS_FOLDER)

  const app = await createServiceApp({
    name: 'payment-service',
    logger: opts.logger,
  })

  app.decorate('paymentService', createPaymentService({ db, processor }))

  await app.register(paymentRoutes)

  return app
}

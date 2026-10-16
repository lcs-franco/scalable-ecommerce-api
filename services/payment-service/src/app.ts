import { authPlugin } from '@ecommerce/auth'
import { DOCS_PREFIX, docsPlugin } from '@ecommerce/docs'
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
import type { IPaymentProcessor } from './payments/payment-processor.js'
import { paymentRoutes } from './routes/payments/payment.routes.js'
import {
  createPaymentService,
  type IPaymentPublishers,
  type PaymentService,
} from './services/payment.service.js'

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyInstance {
    paymentService: PaymentService
  }
}

interface IBuildAppOptions {
  db: Db
  processor: IPaymentProcessor
  publishers: IPaymentPublishers
}

export async function buildApp(opts: IBuildAppOptions) {
  const { db, processor, publishers } = opts

  const app = Fastify({
    logger: getLoggerConfig({ service: 'payment-service', level: 'warn' }),
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

  await app.register(docsPlugin, { title: 'payment-service' })
  await app.register(authPlugin, { publicPrefixes: [DOCS_PREFIX] })

  app.get(
    '/health',
    { config: { skipAuth: true }, schema: { hide: true } },
    async () => ({ status: 'ok' }),
  )

  app.decorate(
    'paymentService',
    createPaymentService({ db, processor, ...publishers }),
  )

  await app.register(paymentRoutes)

  return app
}

import { authPlugin } from '@ecommerce/auth'
import { getLoggerConfig } from '@ecommerce/logger'
import Fastify, { type FastifyError } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { ZodError } from 'zod'
import type { Db } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { ApplicationError, ErrorCode } from './errors/index.js'
import { authRoutes } from './routes/auth/auth.routes.js'
import { profileRoutes } from './routes/profile/profile.routes.js'
import { createAuthService } from './services/auth.service.js'
import { createUserService } from './services/user.service.js'

interface IBuildAppOptions {
  db: Db
  publishUserRegistered: (data: {
    userId: string
    email: string
    name: string
  }) => Promise<void>
}

export async function buildApp(opts: IBuildAppOptions) {
  const app = Fastify({
    logger: getLoggerConfig({ service: 'user-service' }),
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

  const userService = createUserService(opts.db)
  const authService = createAuthService(opts.db, app, userService)

  await app.register(async (instance) => {
    await authRoutes(instance, {
      authService,
      userService,
      publishUserRegistered: opts.publishUserRegistered,
    })
    await profileRoutes(instance, { userService })
  })

  return app
}

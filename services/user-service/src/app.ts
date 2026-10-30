import { authPlugin } from '@ecommerce/auth'
import { DOCS_PREFIX, docsPlugin } from '@ecommerce/docs'
import {
  genRequestId,
  registerErrorHandler,
  registerRequestId,
} from '@ecommerce/http'
import Fastify, { type FastifyBaseLogger } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import type { Db } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { authRoutes } from './routes/auth/auth.routes.js'
import { profileRoutes } from './routes/profile/profile.routes.js'
import { createAuthService } from './services/auth.service.js'
import { createUserService } from './services/user.service.js'

interface IBuildAppOptions {
  logger: FastifyBaseLogger
  db: Db
}

export async function buildApp(opts: IBuildAppOptions) {
  const app = Fastify({
    loggerInstance: opts.logger,
    genReqId: genRequestId,
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await runMigrations(opts.db)

  registerErrorHandler(app)
  registerRequestId(app)

  await app.register(docsPlugin, { title: 'user-service' })
  await app.register(authPlugin, { publicPrefixes: [DOCS_PREFIX] })

  app.get(
    '/health',
    { config: { skipAuth: true }, schema: { hide: true } },
    async () => ({ status: 'ok' }),
  )

  const userService = createUserService(opts.db)
  const authService = createAuthService(opts.db, app, userService)

  await app.register(async (instance) => {
    await authRoutes(instance, { authService, userService })
    await profileRoutes(instance, { userService })
  })

  return app
}

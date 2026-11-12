import { runMigrations } from '@ecommerce/db'
import { createServiceApp } from '@ecommerce/service'
import type { FastifyBaseLogger } from 'fastify'
import { MIGRATIONS_FOLDER, type Db } from './db/index.js'
import { authRoutes } from './routes/auth/auth.routes.js'
import { profileRoutes } from './routes/profile/profile.routes.js'
import { createAuthService } from './services/auth.service.js'
import { createUserService } from './services/user.service.js'

interface IBuildAppOptions {
  logger: FastifyBaseLogger
  db: Db
}

export async function buildApp(opts: IBuildAppOptions) {
  await runMigrations(opts.db, MIGRATIONS_FOLDER)

  const app = await createServiceApp({
    name: 'user-service',
    logger: opts.logger,
  })

  const userService = createUserService(opts.db)
  const authService = createAuthService(opts.db, app, userService)

  await app.register(async (instance) => {
    await authRoutes(instance, { authService, userService })
    await profileRoutes(instance, { userService })
  })

  return app
}

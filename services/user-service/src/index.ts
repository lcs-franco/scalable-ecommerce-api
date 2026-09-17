import { authPlugin } from '@ecommerce/auth'
import { createProducer, Topics } from '@ecommerce/events'
import { createLogger } from '@ecommerce/logger'
import Fastify, { type FastifyError } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { Kafka } from 'kafkajs'
import { config } from './config.js'
import { createDb } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { ApplicationError, ErrorCode } from './errors/index.js'
import { authRoutes } from './routes/auth/auth.routes.js'
import { profileRoutes } from './routes/profile/profile.routes.js'
import { createAuthService } from './services/auth.service.js'
import { createUserService } from './services/user.service.js'

async function main() {
  const logger = createLogger({ service: 'user-service' })
  const app = Fastify({ logger })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Database
  const { db, pool } = createDb(config.DATABASE_URL)
  await runMigrations(db)
  logger.info('migrations applied')

  // Kafka producer
  const kafka = new Kafka({
    clientId: 'user-service',
    brokers: [config.KAFKA_BROKER],
  })
  const producer = createProducer(kafka)
  await producer.connect()
  logger.info('kafka producer connected')

  // Auth plugin
  await app.register(authPlugin)

  // Services
  const userService = createUserService(db)
  const authService = createAuthService(db, app, userService)

  // Routes
  await app.register(async (instance) => {
    await authRoutes(instance, {
      authService,
      userService,
      publishUserRegistered: (data) =>
        producer.publish(Topics.USER_REGISTERED, data),
    })
    await profileRoutes(instance, { userService })
  })

  // Error handler
  app.setErrorHandler(
    (error: FastifyError | ApplicationError, _request, reply) => {
      if ('validation' in error) {
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

      app.log.error(error)
      return reply.status(500).send({
        error: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      })
    },
  )

  // Graceful shutdown
  const shutdown = async () => {
    await app.close()
    await producer.disconnect()
    await pool.end()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('failed to start user-service', err)
  process.exit(1)
})

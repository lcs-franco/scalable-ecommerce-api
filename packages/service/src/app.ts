import { authPlugin } from '@ecommerce/auth'
import { DOCS_PREFIX, docsPlugin } from '@ecommerce/docs'
import {
  genRequestId,
  registerErrorHandler,
  registerRequestId,
} from '@ecommerce/http'
import { metricsPlugin } from '@ecommerce/metrics'
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'

export interface ICreateServiceAppOptions {
  name: string
  logger: FastifyBaseLogger
  internalToken?: string
  docs?: boolean
  auth?: boolean
}

export async function createServiceApp({
  name,
  logger,
  internalToken,
  docs = true,
  auth = true,
}: ICreateServiceAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: logger, genReqId: genRequestId })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  registerErrorHandler(app)
  registerRequestId(app)
  await app.register(metricsPlugin)

  if (docs) await app.register(docsPlugin, { title: name })

  if (auth) {
    await app.register(authPlugin, {
      publicPrefixes: docs ? [DOCS_PREFIX] : [],
      internalToken,
    })
  }

  app.get(
    '/health',
    { config: { skipAuth: true }, schema: { hide: true } },
    async () => ({ status: 'ok' }),
  )

  return app
}

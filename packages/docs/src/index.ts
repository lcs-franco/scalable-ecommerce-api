// Keep the FastifySchema augmentation (`hide`, `security`, …) in the emitted
// .d.ts so services importing this package can type those schema fields.
/// <reference types="@fastify/swagger" preserve="true" />
import fastifySwagger from '@fastify/swagger'
import scalar from '@scalar/fastify-api-reference'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

export const DOCS_PREFIX = '/docs'

export interface IDocsOptions {
  title: string
  description?: string
  version?: string
}

export const docsPlugin = fp<IDocsOptions>(
  async function docs(app: FastifyInstance, opts) {
    const { title, description, version = '1.0.0' } = opts

    // Mirror the auth route config in the spec: internal (service-to-service)
    // routes are hidden, public ones are not shown as protected by bearerAuth.
    app.addHook('onRoute', (routeOptions) => {
      const config = routeOptions.config as
        { skipAuth?: boolean; internal?: boolean } | undefined
      if (config?.internal) {
        routeOptions.schema = { ...routeOptions.schema, hide: true }
      } else if (config?.skipAuth) {
        routeOptions.schema = { ...routeOptions.schema, security: [] }
      }
    })

    await app.register(fastifySwagger, {
      transform: jsonSchemaTransform,
      openapi: {
        info: { title, description, version },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        security: [{ bearerAuth: [] }],
      },
    })

    await app.register(scalar, { routePrefix: DOCS_PREFIX })
  },
  { name: 'docs' },
)

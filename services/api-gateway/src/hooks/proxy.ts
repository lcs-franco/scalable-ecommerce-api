import replyFrom from '@fastify/reply-from'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { IncomingHttpHeaders } from 'node:http'
import { BadGateway, GatewayTimeout } from '../errors/index.js'
import { ROUTES, STRIPPED_PREFIX, type Upstreams } from '../routes/table.js'

const CLIENT_FORBIDDEN_HEADERS = [
  'x-user-id',
  'x-user-role',
  'x-internal-token',
]

function forwardedHeaders(
  headers: IncomingHttpHeaders,
  request: FastifyRequest,
): IncomingHttpHeaders {
  const result = { ...headers }
  for (const name of CLIENT_FORBIDDEN_HEADERS) delete result[name]

  result['x-request-id'] = request.id
  if (request.identity) {
    result['x-user-id'] = request.identity.userId
    result['x-user-role'] = request.identity.role
  }
  return result
}

export async function registerProxy(
  app: FastifyInstance,
  opts: { upstreams: Upstreams; timeoutMs: number },
) {
  app.removeAllContentTypeParsers()
  app.addContentTypeParser('*', (_request, payload, done) =>
    done(null, payload),
  )

  await app.register(replyFrom)

  for (const route of ROUTES) {
    const base = opts.upstreams[route.upstream].replace(/\/$/, '')
    const prefix = STRIPPED_PREFIX[route.upstream]

    app.route({
      method: route.method,
      url: route.path,
      config: { access: route.access },
      handler: (request, reply) =>
        reply.from(`${base}${request.url.slice(prefix.length)}`, {
          timeout: opts.timeoutMs,
          rewriteRequestHeaders: (_req, headers) =>
            forwardedHeaders(headers, request),
          onError: (reply, { error }) => {
            const { statusCode } = error as { statusCode?: number }
            reply.send(
              statusCode === 504 ? new GatewayTimeout() : new BadGateway(),
            )
          },
        }),
    })
  }
}

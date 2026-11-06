import { REQUEST_ID_HEADER } from '@ecommerce/http'
import type { IUpstreamCall } from '@ecommerce/metrics'
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

  result[REQUEST_ID_HEADER] = request.id
  if (request.identity) {
    result['x-user-id'] = request.identity.userId
    result['x-user-role'] = request.identity.role
  }
  return result
}

export async function registerProxy(
  app: FastifyInstance,
  opts: {
    upstreams: Upstreams
    timeoutMs: number
    onUpstream?: (call: IUpstreamCall) => void
  },
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
      handler: (request, reply) => {
        const startedAt = performance.now()

        const observe = (outcome: IUpstreamCall['outcome']) =>
          opts.onUpstream?.({
            upstream: `${route.upstream}-service`,
            durationMs: performance.now() - startedAt,
            outcome,
          })

        return reply.from(`${base}${request.url.slice(prefix.length)}`, {
          timeout: opts.timeoutMs,
          rewriteRequestHeaders: (_req, headers) =>
            forwardedHeaders(headers, request),
          onResponse: (_request, reply, res) => {
            observe('ok')
            reply.send(res.stream)
          },
          onError: (reply, { error }) => {
            const { statusCode } = error as { statusCode?: number }
            const timedOut = statusCode === 504

            observe(timedOut ? 'timeout' : 'error')
            reply.send(timedOut ? new GatewayTimeout() : new BadGateway())
          },
        })
      },
    })
  }
}

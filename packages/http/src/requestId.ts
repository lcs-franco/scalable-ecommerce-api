import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { IncomingMessage } from 'node:http'

export const REQUEST_ID_HEADER = 'x-request-id'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function genRequestId(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER]

  return typeof incoming === 'string' && UUID.test(incoming)
    ? incoming
    : randomUUID()
}

export function registerRequestId(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id)
  })
}

export function requestIdHeaders(requestId?: string): Record<string, string> {
  return requestId ? { [REQUEST_ID_HEADER]: requestId } : {}
}

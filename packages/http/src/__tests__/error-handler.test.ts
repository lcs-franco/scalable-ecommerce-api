import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ApplicationError,
  Forbidden,
  registerErrorHandler,
  Unauthorized,
} from '../index.js'

async function createTestApp(throwError: () => unknown) {
  const app = Fastify({
    logger: {
      level: 'error',
      stream: { write: (line: string) => loggedLines.push(line) },
    },
  })

  registerErrorHandler(app)

  app.route({
    method: ['GET', 'POST'],
    url: '/boom',
    handler: async () => {
      throw throwError()
    },
  })

  await app.ready()

  return app
}

let app: Awaited<ReturnType<typeof createTestApp>>

let loggedLines: string[] = []

afterEach(async () => {
  await app?.close()

  loggedLines = []
})

describe('registerErrorHandler', () => {
  it('maps a ZodError to 400 VALIDATION', async () => {
    app = await createTestApp(() => {
      const result = z.object({ name: z.string() }).safeParse({})

      return result.error
    })

    const res = await app.inject({ method: 'GET', url: '/boom' })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'VALIDATION' })
    expect(res.json().message).toContain('name')
  })

  it('maps an ApplicationError to its statusCode and code', async () => {
    class OrderNotFound extends ApplicationError {
      public override statusCode = 404
      public override code = 'ORDER_NOT_FOUND'
    }

    app = await createTestApp(() => new OrderNotFound('Order not found'))

    const res = await app.inject({ method: 'GET', url: '/boom' })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({
      error: 'ORDER_NOT_FOUND',
      message: 'Order not found',
    })
  })

  it('maps an HttpError to its statusCode and code', async () => {
    app = await createTestApp(() => new Forbidden('Admin access required'))

    const res = await app.inject({ method: 'GET', url: '/boom' })

    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Admin access required',
    })
  })

  it('maps Unauthorized to 401 with its default message', async () => {
    app = await createTestApp(() => new Unauthorized())

    const res = await app.inject({ method: 'GET', url: '/boom' })

    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid access token',
    })
  })

  it('keeps the status of a Fastify client error', async () => {
    app = await createTestApp(() => new Error('unreachable'))

    const res = await app.inject({
      method: 'POST',
      url: '/boom',
      headers: { 'content-type': 'application/xml' },
      payload: '<order />',
    })

    expect(res.statusCode).toBe(415)
    expect(res.json()).toEqual({
      error: 'Unsupported Media Type',
      message: 'Unsupported Media Type',
    })
  })

  it('maps an unknown error to 500 and logs it', async () => {
    app = await createTestApp(() => new Error('database exploded'))

    const res = await app.inject({ method: 'GET', url: '/boom' })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    })
    expect(loggedLines.join('')).toContain('database exploded')
  })
})

import { ApplicationError } from '@ecommerce/http'
import { createLogger } from '@ecommerce/logger'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { createServiceApp, type ICreateServiceAppOptions } from '../index.js'

class OutOfStock extends ApplicationError {
  readonly statusCode = 409
  readonly code = 'OUT_OF_STOCK'
}

let app: FastifyInstance | undefined

async function build(opts: Partial<ICreateServiceAppOptions> = {}) {
  process.env.JWT_SECRET ??= 'test-secret'

  app = await createServiceApp({
    name: 'test-service',
    logger: createLogger({ service: 'test-service', level: 'silent' }),
    ...opts,
  })

  app.get('/boom', async () => {
    throw new OutOfStock('Product is out of stock')
  })

  await app.ready()

  return app
}

afterEach(async () => {
  await app?.close()
})

describe('createServiceApp', () => {
  it('should answer /health without a token', async () => {
    const res = await (await build()).inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('should echo a valid incoming x-request-id', async () => {
    const incoming = '4f1c2a9e-8b3d-4e5f-9a6b-7c8d9e0f1a2b'

    const res = await (
      await build()
    ).inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': incoming },
    })

    expect(res.headers['x-request-id']).toBe(incoming)
  })

  it('should answer 404 for an unknown route', async () => {
    const res = await (
      await build({ auth: false })
    ).inject({
      method: 'GET',
      url: '/nope',
    })

    expect(res.statusCode).toBe(404)
  })

  it('should not serve /metrics on the app port', async () => {
    const res = await (
      await build({ auth: false })
    ).inject({
      method: 'GET',
      url: '/metrics',
    })

    expect(res.statusCode).toBe(404)
  })

  it('should map an application error to its status and code', async () => {
    const res = await (
      await build({ auth: false })
    ).inject({
      method: 'GET',
      url: '/boom',
    })

    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({
      error: 'OUT_OF_STOCK',
      message: 'Product is out of stock',
    })
  })

  it('should require a token on routes by default', async () => {
    const res = await (await build()).inject({ method: 'GET', url: '/boom' })

    expect(res.statusCode).toBe(401)
  })

  it('should serve docs publicly unless turned off', async () => {
    const withDocs = await (
      await build()
    ).inject({ method: 'GET', url: '/docs/' })

    expect(withDocs.statusCode).toBe(200)

    await app?.close()

    const withoutDocs = await (
      await build({ docs: false })
    ).inject({
      method: 'GET',
      url: '/docs/',
    })

    expect(withoutDocs.statusCode).toBe(401)
  })
})

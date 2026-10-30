import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createProductClient } from '../services/product.client.js'

describe('product client', () => {
  let upstream: FastifyInstance
  let baseUrl: string
  let lastHeaders: Record<string, unknown>

  beforeAll(async () => {
    upstream = Fastify()
    upstream.get('/products/:id', async (request) => {
      lastHeaders = request.headers

      return { id: 'product-1', name: 'Product', price: 1000 }
    })
    baseUrl = await upstream.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await upstream.close()
  })

  it('should forward x-request-id on fetchProducts', async () => {
    const requestId = '4f1c2a9e-8b3d-4e5f-9a6b-7c8d9e0f1a2b'

    await createProductClient(baseUrl).fetchProducts(['product-1'], requestId)

    expect(lastHeaders['x-request-id']).toBe(requestId)
  })
})

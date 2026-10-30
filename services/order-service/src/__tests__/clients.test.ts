import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCartClient } from '../clients/cart.client.js'
import { createProductClient } from '../clients/product.client.js'
import {
  ApplicationError,
  CartEmpty,
  InsufficientStock,
} from '../errors/index.js'

describe('service clients', () => {
  let upstream: FastifyInstance
  let baseUrl: string
  let lastHeaders: Record<string, unknown>
  let respond: (reply: {
    status: (code: number) => { send: (body: unknown) => unknown }
  }) => unknown

  beforeAll(async () => {
    upstream = Fastify()
    upstream.all('/*', async (request, reply) => {
      lastHeaders = request.headers

      return respond(reply)
    })
    baseUrl = await upstream.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await upstream.close()
  })

  function upstreamReplies(status: number, body: unknown) {
    respond = (reply) => reply.status(status).send(body)
  }

  describe('cart client checkout', () => {
    const cartClient = () =>
      createCartClient({ baseUrl, internalServiceToken: 'token' })

    it('should throw CartEmpty when the cart is empty', async () => {
      upstreamReplies(400, { error: 'CART_EMPTY', message: 'Cart is empty' })

      await expect(cartClient().checkout('user-1')).rejects.toBeInstanceOf(
        CartEmpty,
      )
    })

    it.each([
      [401, { error: 'Invalid or missing service token' }],
      [500, { error: 'INTERNAL_SERVER_ERROR', message: 'boom' }],
      [502, 'Bad Gateway'],
    ])(
      'should throw a generic error on unexpected %i',
      async (status, body) => {
        upstreamReplies(status, body)

        const error = await cartClient()
          .checkout('user-1')
          .catch((e: unknown) => e)
        expect(error).not.toBeInstanceOf(ApplicationError)
        expect((error as Error).message).toMatch(
          `Cart checkout failed: ${status}`,
        )
      },
    )
  })

  describe('product client validateOrder', () => {
    const productClient = () =>
      createProductClient({ baseUrl, internalServiceToken: 'token' })
    const items = [{ productId: 'product-1', quantity: 2 }]

    it('should authenticate with the internal token, not a user JWT', async () => {
      upstreamReplies(200, { items: [] })

      await productClient().validateOrder(items)

      expect(lastHeaders['x-internal-token']).toBe('token')
      expect(lastHeaders.authorization).toBeUndefined()
    })

    it('should throw InsufficientStock with the upstream message', async () => {
      upstreamReplies(409, {
        error: 'INSUFFICIENT_STOCK',
        message: 'Insufficient stock for product product-1',
      })

      const error = await productClient()
        .validateOrder(items)
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(InsufficientStock)
      expect((error as Error).message).toBe(
        'Insufficient stock for product product-1',
      )
    })

    it('should fall back to a generic message when upstream sends none', async () => {
      upstreamReplies(409, { error: 'INSUFFICIENT_STOCK' })

      await expect(productClient().validateOrder(items)).rejects.toThrow(
        new InsufficientStock('Insufficient stock'),
      )
    })

    it.each([
      [400, { error: 'body/items Invalid', message: 'body/items Invalid' }],
      [401, { error: 'Unauthorized', message: 'No Authorization' }],
      [500, { error: 'INTERNAL_SERVER_ERROR', message: 'boom' }],
      [502, 'Bad Gateway'],
    ])(
      'should throw a generic error on unexpected %i',
      async (status, body) => {
        upstreamReplies(status, body)

        const error = await productClient()
          .validateOrder(items)
          .catch((e: unknown) => e)
        expect(error).not.toBeInstanceOf(ApplicationError)
        expect((error as Error).message).toMatch(
          `Product validation failed: ${status}`,
        )
      },
    )
  })

  describe('request id', () => {
    const requestId = '4f1c2a9e-8b3d-4e5f-9a6b-7c8d9e0f1a2b'
    const items = [{ productId: 'product-1', quantity: 2 }]
    const opts = () => ({ baseUrl, internalServiceToken: 'token' })

    it.each([
      [
        'cart checkout',
        () => createCartClient(opts()).checkout('user-1', requestId),
      ],
      [
        'cart restore',
        () => createCartClient(opts()).restore(items, 'jwt', requestId),
      ],
      [
        'product validateOrder',
        () => createProductClient(opts()).validateOrder(items, requestId),
      ],
      [
        'product restoreStock',
        () => createProductClient(opts()).restoreStock(items, requestId),
      ],
      [
        'product restoreOrderStock',
        () =>
          createProductClient(opts()).restoreOrderStock(
            'order-1',
            items,
            requestId,
          ),
      ],
    ])('should forward x-request-id on %s', async (_name, call) => {
      upstreamReplies(200, { items: [] })

      await call()

      expect(lastHeaders['x-request-id']).toBe(requestId)
    })

    it('should not send x-request-id when there is none', async () => {
      upstreamReplies(200, { items: [] })

      await createProductClient(opts()).validateOrder(items)

      expect(lastHeaders['x-request-id']).toBeUndefined()
    })
  })
})

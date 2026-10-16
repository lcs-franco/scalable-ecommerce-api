import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCartClient } from '../clients/cart.client.js'
import { ApplicationError, CartEmpty } from '../errors/index.js'

describe('service clients', () => {
  let upstream: FastifyInstance
  let baseUrl: string
  let respond: (reply: {
    status: (code: number) => { send: (body: unknown) => unknown }
  }) => unknown

  beforeAll(async () => {
    upstream = Fastify()
    upstream.all('/*', async (_request, reply) => respond(reply))
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
})

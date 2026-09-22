import '@ecommerce/auth'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { createCartService } from '../../services/cart.service.js'
import type { createProductClient } from '../../services/product.client.js'
import {
  AddItemBodySchema,
  ProductIdParamsSchema,
  UpdateItemBodySchema,
} from './schemas/cart.schemas.js'

interface IDeps extends FastifyPluginOptions {
  cartService: ReturnType<typeof createCartService>
  productClient: ReturnType<typeof createProductClient>
  internalServiceToken: string
}

export async function cartRoutes(fastify: FastifyInstance, deps: IDeps) {
  const { cartService, productClient, internalServiceToken } = deps
  const app = fastify.withTypeProvider<ZodTypeProvider>()

  app.post(
    '/cart/items',
    { schema: { body: AddItemBodySchema } },
    async (request, reply) => {
      const { productId, quantity } = request.body
      await cartService.addItem(request.user.userId, productId, quantity)
      return reply.status(201).send({ message: 'Item added to cart' })
    },
  )

  app.patch(
    '/cart/items/:productId',
    {
      schema: {
        params: ProductIdParamsSchema,
        body: UpdateItemBodySchema,
      },
    },
    async (request, reply) => {
      await cartService.updateItem(
        request.user.userId,
        request.params.productId,
        request.body.quantity,
      )
      return reply.send({ message: 'Cart updated' })
    },
  )

  app.delete(
    '/cart/items/:productId',
    { schema: { params: ProductIdParamsSchema } },
    async (request, reply) => {
      await cartService.removeItem(
        request.user.userId,
        request.params.productId,
      )
      return reply.status(204).send()
    },
  )

  app.get('/cart', async (request, reply) => {
    const items = await cartService.getItems(request.user.userId)
    if (items.length === 0) {
      return reply.send({ items: [], total: 0 })
    }

    const productIds = items.map((i) => i.productId)
    const products = await productClient.fetchProducts(productIds)
    return reply.send(cartService.enrichItems(items, products))
  })

  app.delete('/cart', async (request, reply) => {
    await cartService.clear(request.user.userId)
    return reply.status(204).send()
  })

  // Internal endpoint — called service-to-service by order-service.
  // Authenticated via shared secret (x-internal-token), not JWT.
  app.post(
    '/cart/checkout',
    { config: { skipAuth: true } },
    async (request, reply) => {
      const token = request.headers['x-internal-token'] as string
      if (token !== internalServiceToken) {
        return reply
          .status(401)
          .send({ error: 'Invalid or missing service token' })
      }
      const userId = request.headers['x-user-id'] as string
      if (!userId) {
        return reply.status(400).send({ error: 'x-user-id header required' })
      }
      const items = await cartService.checkout(userId)
      return reply.send({ items })
    },
  )
}

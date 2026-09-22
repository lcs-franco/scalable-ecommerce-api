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
}

export async function cartRoutes(fastify: FastifyInstance, deps: IDeps) {
  const { cartService, productClient } = deps
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

    const enriched = items.map((item) => {
      const product = products.get(item.productId)
      return {
        productId: item.productId,
        name: product?.name ?? null,
        price: product?.price ?? null,
        quantity: item.quantity,
        lineTotal: product ? product.price * item.quantity : null,
        unavailable: !product,
      }
    })

    const total = enriched.reduce((sum, i) => sum + (i.lineTotal ?? 0), 0)
    return reply.send({ items: enriched, total })
  })

  app.delete('/cart', async (request, reply) => {
    await cartService.clear(request.user.userId)
    return reply.status(204).send()
  })

  app.post('/cart/checkout', async (request, reply) => {
    const items = await cartService.checkout(request.user.userId)
    return reply.send({ items })
  })
}

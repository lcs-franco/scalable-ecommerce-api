import '@ecommerce/auth'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { Forbidden } from '../../errors/index.js'
import type { createProductService } from '../../services/product.service.js'
import {
  CreateProductBodySchema,
  ListProductsQuerySchema,
  ProductParamsSchema,
  UpdateProductBodySchema,
  ValidateOrderBodySchema,
} from './schemas/product.schemas.js'

interface IDeps extends FastifyPluginOptions {
  productService: ReturnType<typeof createProductService>
}

function requireAdmin(role: string) {
  if (role !== 'admin') throw new Forbidden()
}

export async function productRoutes(fastify: FastifyInstance, deps: IDeps) {
  const { productService } = deps
  const app = fastify.withTypeProvider<ZodTypeProvider>()

  app.get(
    '/products',
    {
      config: { skipAuth: true },
      schema: { querystring: ListProductsQuerySchema },
    },
    async (request, reply) => {
      const result = await productService.list(request.query)
      return reply.send(result)
    },
  )

  app.get(
    '/products/:id',
    { config: { skipAuth: true }, schema: { params: ProductParamsSchema } },
    async (request, reply) => {
      const product = await productService.findById(request.params.id)
      return reply.send(product)
    },
  )

  app.post(
    '/products',
    { schema: { body: CreateProductBodySchema } },
    async (request, reply) => {
      requireAdmin(request.user.role)
      const product = await productService.create(request.body)
      return reply.status(201).send(product)
    },
  )

  app.patch(
    '/products/:id',
    {
      schema: {
        params: ProductParamsSchema,
        body: UpdateProductBodySchema,
      },
    },
    async (request, reply) => {
      requireAdmin(request.user.role)
      const product = await productService.update(
        request.params.id,
        request.body,
      )
      return reply.send(product)
    },
  )

  app.delete(
    '/products/:id',
    { schema: { params: ProductParamsSchema } },
    async (request, reply) => {
      requireAdmin(request.user.role)
      await productService.remove(request.params.id)
      return reply.status(204).send()
    },
  )

  app.post(
    '/products/validate-order',
    { schema: { body: ValidateOrderBodySchema } },
    async (request, reply) => {
      const validated = await productService.validateOrder(request.body.items)
      return reply.send({ items: validated })
    },
  )
}

import '@ecommerce/auth'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { Forbidden } from '../../errors/index.js'
import type { createCategoryService } from '../../services/category.service.js'
import {
  CategoryParamsSchema,
  CreateCategoryBodySchema,
  UpdateCategoryBodySchema,
} from './schemas/category.schemas.js'

interface IDeps extends FastifyPluginOptions {
  categoryService: ReturnType<typeof createCategoryService>
}

function requireAdmin(role: string) {
  if (role !== 'admin') throw new Forbidden()
}

export async function categoryRoutes(fastify: FastifyInstance, deps: IDeps) {
  const { categoryService } = deps
  const app = fastify.withTypeProvider<ZodTypeProvider>()

  app.get(
    '/categories',
    { config: { skipAuth: true } },
    async (_request, reply) => {
      const items = await categoryService.findAll()
      return reply.send(items)
    },
  )

  app.post(
    '/categories',
    { schema: { body: CreateCategoryBodySchema } },
    async (request, reply) => {
      requireAdmin(request.user.role)
      const category = await categoryService.create(request.body.name)
      return reply.status(201).send(category)
    },
  )

  app.patch(
    '/categories/:id',
    {
      schema: {
        params: CategoryParamsSchema,
        body: UpdateCategoryBodySchema,
      },
    },
    async (request, reply) => {
      requireAdmin(request.user.role)
      const category = await categoryService.update(
        request.params.id,
        request.body.name,
      )
      return reply.send(category)
    },
  )

  app.delete(
    '/categories/:id',
    { schema: { params: CategoryParamsSchema } },
    async (request, reply) => {
      requireAdmin(request.user.role)
      await categoryService.remove(request.params.id)
      return reply.status(204).send()
    },
  )
}

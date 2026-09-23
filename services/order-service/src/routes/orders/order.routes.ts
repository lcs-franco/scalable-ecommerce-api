import '@ecommerce/auth'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { Forbidden } from '../../errors/index.js'
import type { createOrderService } from '../../services/order.service.js'
import {
  ListOrdersQuerySchema,
  OrderParamsSchema,
  UpdateStatusBodySchema,
} from './schemas/order.schemas.js'

interface IDeps extends FastifyPluginOptions {
  orderService: ReturnType<typeof createOrderService>
}

function requireAdmin(role: string) {
  if (role !== 'admin') throw new Forbidden()
}

export async function orderRoutes(fastify: FastifyInstance, deps: IDeps) {
  const { orderService } = deps
  const app = fastify.withTypeProvider<ZodTypeProvider>()

  app.post('/orders', async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '') ?? ''
    const order = await orderService.placeOrder(request.user.userId, token)
    return reply.status(201).send(order)
  })

  app.get(
    '/orders',
    { schema: { querystring: ListOrdersQuerySchema } },
    async (request, reply) => {
      const isAdmin = request.user.role === 'admin'
      const result = await orderService.list({
        userId: isAdmin ? undefined : request.user.userId,
        status: isAdmin ? request.query.status : undefined,
        limit: request.query.limit,
        offset: request.query.offset,
      })
      return reply.send(result)
    },
  )

  app.get(
    '/orders/:id',
    { schema: { params: OrderParamsSchema } },
    async (request, reply) => {
      const order = await orderService.findById(request.params.id)
      if (
        request.user.role !== 'admin' &&
        order.userId !== request.user.userId
      ) {
        throw new Forbidden()
      }
      return reply.send(order)
    },
  )

  app.patch(
    '/orders/:id/status',
    {
      schema: {
        params: OrderParamsSchema,
        body: UpdateStatusBodySchema,
      },
    },
    async (request, reply) => {
      requireAdmin(request.user.role)
      const order = await orderService.updateStatus(
        request.params.id,
        request.body.status,
      )
      return reply.send(order)
    },
  )
}

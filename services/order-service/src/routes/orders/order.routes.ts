import '@ecommerce/auth'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { Forbidden } from '../../errors/index.js'
import {
  ListOrdersQuerySchema,
  OrderParamsSchema,
  PlaceOrderBodySchema,
  UpdateStatusBodySchema,
} from './schemas/order.schemas.js'

function requireAdmin(role: string) {
  if (role !== 'admin') throw new Forbidden()
}

export async function orderRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>()

  app.post(
    '/orders',
    { schema: { body: PlaceOrderBodySchema } },
    async (request, reply) => {
      const token = request.headers.authorization?.replace('Bearer ', '') ?? ''

      const order = await app.orderService.placeOrder(
        request.user,
        token,
        request.body.paymentMethodId,
      )

      return reply.status(201).send(order)
    },
  )

  app.get(
    '/orders',
    { schema: { querystring: ListOrdersQuerySchema } },
    async (request, reply) => {
      const isAdmin = request.user.role === 'admin'
      const result = await app.orderService.list({
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
      const order = await app.orderService.findById(request.params.id)
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
      const order = await app.orderService.updateStatus(
        request.params.id,
        request.body.status,
      )
      return reply.send(order)
    },
  )
}

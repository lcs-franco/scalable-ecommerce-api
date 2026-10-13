import '@ecommerce/auth'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { Forbidden } from '../../errors/index.js'
import { PaymentOrderParamsSchema } from './schemas/payment.schemas.js'

export async function paymentRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>()

  app.get(
    '/payments/order/:orderId',
    { schema: { params: PaymentOrderParamsSchema } },
    async (request, reply) => {
      const payment = await app.paymentService.findByOrderId(
        request.params.orderId,
      )

      if (
        request.user.role !== 'admin' &&
        payment.userId !== request.user.userId
      ) {
        throw new Forbidden()
      }
      return reply.send(payment)
    },
  )
}

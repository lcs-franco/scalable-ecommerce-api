import { z } from 'zod'

export const PaymentOrderParamsSchema = z.object({
  orderId: z.string().uuid(),
})

import { z } from 'zod'

export const OrderParamsSchema = z.object({
  id: z.string().uuid(),
})

export const ListOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z
    .enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled'])
    .optional(),
})

export const UpdateStatusBodySchema = z.object({
  status: z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']),
})

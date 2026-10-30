import { z } from 'zod'
import { orderStatusEnum } from '../../../db/schema.js'

export const OrderParamsSchema = z.object({
  id: z.string().uuid(),
})

export const ListOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(orderStatusEnum.enumValues).optional(),
})

export const PlaceOrderBodySchema = z.object({
  paymentMethodId: z.string().min(1).max(255),
})

export const UpdateStatusBodySchema = z.object({
  status: z.enum(orderStatusEnum.enumValues),
})

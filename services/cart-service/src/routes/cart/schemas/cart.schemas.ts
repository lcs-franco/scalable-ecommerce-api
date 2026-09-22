import { z } from 'zod'

export const AddItemBodySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1),
})

export const UpdateItemBodySchema = z.object({
  quantity: z.number().int().min(1),
})

export const ProductIdParamsSchema = z.object({
  productId: z.string().uuid(),
})

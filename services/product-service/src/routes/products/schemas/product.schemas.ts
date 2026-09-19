import { z } from 'zod'

export const ProductParamsSchema = z.object({
  id: z.string().uuid(),
})

export const ListProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  categoryId: z.string().uuid().optional(),
  q: z.string().optional(),
})

export const CreateProductBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().int().min(0),
  stock: z.number().int().min(0),
  categoryId: z.string().uuid(),
})

export const UpdateProductBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  categoryId: z.string().uuid().optional(),
})

export const ValidateOrderBodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1),
})

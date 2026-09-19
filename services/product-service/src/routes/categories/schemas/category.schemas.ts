import { z } from 'zod'

export const CreateCategoryBodySchema = z.object({
  name: z.string().min(1),
})

export const UpdateCategoryBodySchema = z.object({
  name: z.string().min(1),
})

export const CategoryParamsSchema = z.object({
  id: z.string().uuid(),
})

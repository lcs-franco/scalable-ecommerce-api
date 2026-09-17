import { z } from 'zod'

export const UpdateProfileBodySchema = z.object({
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
})

export type IUpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>

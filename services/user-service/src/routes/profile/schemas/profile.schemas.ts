import { z } from 'zod'

export const UpdateProfileBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    password: z.string().min(8).optional(),
  })
  .refine((data) => data.name !== undefined || data.password !== undefined, {
    message: 'At least one of name or password must be provided',
  })

export type IUpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>

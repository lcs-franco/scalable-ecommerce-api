import { z } from 'zod'

export const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
})

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const RefreshBodySchema = z.object({
  refreshToken: z.string().uuid(),
})

export const UpdateProfileBodySchema = z.object({
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
})

export type IRegisterBody = z.infer<typeof RegisterBodySchema>
export type ILoginBody = z.infer<typeof LoginBodySchema>
export type IRefreshBody = z.infer<typeof RefreshBodySchema>
export type IUpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>

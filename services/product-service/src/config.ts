import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  INTERNAL_SERVICE_TOKEN: z.string().min(1).optional(),
})

export const config = envSchema.parse(process.env)

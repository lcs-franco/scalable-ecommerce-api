import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3003),
  REDIS_URL: z.string().min(1).default('redis://localhost:6380'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PRODUCT_SERVICE_URL: z.string().url().default('http://localhost:3002'),
})

export const config = envSchema.parse(process.env)

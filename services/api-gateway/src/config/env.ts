import 'dotenv/config'
import { LOG_LEVELS } from '@ecommerce/logger'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  USER_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  PRODUCT_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  CART_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  ORDER_SERVICE_URL: z.string().url().default('http://localhost:3004'),
  PAYMENT_SERVICE_URL: z.string().url().default('http://localhost:3005'),
  RATE_LIMIT_ANONYMOUS: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_AUTHENTICATED: z.coerce.number().int().positive().default(100),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
})

export const config = envSchema.parse(process.env)

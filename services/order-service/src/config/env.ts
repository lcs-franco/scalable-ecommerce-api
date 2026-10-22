import 'dotenv/config'
import { LOG_LEVELS } from '@ecommerce/logger'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3004),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  KAFKA_BROKER: z.string().default('localhost:9092'),
  CART_SERVICE_URL: z.string().url(),
  PRODUCT_SERVICE_URL: z.string().url(),
  INTERNAL_SERVICE_TOKEN: z
    .string()
    .min(16, 'INTERNAL_SERVICE_TOKEN must be at least 16 characters'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
})

export const config = envSchema.parse(process.env)

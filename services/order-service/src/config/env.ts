import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3004),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  KAFKA_BROKER: z.string().default('localhost:9092'),
  CART_SERVICE_URL: z.string().url(),
  PRODUCT_SERVICE_URL: z.string().url(),
  INTERNAL_SERVICE_TOKEN: z.string().min(1),
})

export const config = envSchema.parse(process.env)

import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3005),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  KAFKA_BROKER: z.string().default('localhost:9092'),
  STRIPE_SECRET_KEY: z
    .string()
    .startsWith('sk_test_', 'STRIPE_SECRET_KEY must be a test-mode key'),
  STRIPE_TEST_PAYMENT_METHOD: z.string().default('pm_card_visa'),
})

export const config = envSchema.parse(process.env)

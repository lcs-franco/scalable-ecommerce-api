import { LOG_LEVELS } from '@ecommerce/logger'
import { z } from 'zod'

const baseSchema = z.object({
  PORT: z.coerce.number().default(3005),
  METRICS_PORT: z.coerce.number().default(9464),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  KAFKA_BROKER: z.string().default('localhost:9092'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
})

const nonNegativeMs = z.coerce.number().int().nonnegative().default(0)

const processorSchema = z.discriminatedUnion('PAYMENT_PROCESSOR', [
  z.object({
    PAYMENT_PROCESSOR: z.literal('stripe'),
    STRIPE_SECRET_KEY: z
      .string()
      .startsWith('sk_test_', 'STRIPE_SECRET_KEY must be a test-mode key'),
  }),
  z.object({
    PAYMENT_PROCESSOR: z.literal('fake'),
    FAKE_PAYMENT_LATENCY_MS: nonNegativeMs,
    FAKE_PAYMENT_JITTER_MS: nonNegativeMs,
    FAKE_PAYMENT_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  }),
])

// discriminatedUnion ignores a default on its discriminator
const envSchema = z.preprocess(
  (env) => ({ PAYMENT_PROCESSOR: 'stripe', ...(env as object) }),
  baseSchema.and(processorSchema),
)

export function parseEnv(env: Record<string, string | undefined>) {
  return envSchema.parse(env)
}

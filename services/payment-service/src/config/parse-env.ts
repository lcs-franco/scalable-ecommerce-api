import { baseConfig, jwtSecret } from '@ecommerce/service'
import { z } from 'zod'

const baseSchema = baseConfig({ port: 3005 }).extend({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: jwtSecret,
  KAFKA_BROKER: z.string().default('localhost:9092'),
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
export const envSchema = z.preprocess(
  (env) => ({ PAYMENT_PROCESSOR: 'stripe', ...(env as object) }),
  baseSchema.and(processorSchema),
)

export function parseEnv(env: Record<string, string | undefined>) {
  return envSchema.parse(env)
}

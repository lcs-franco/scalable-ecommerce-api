import 'dotenv/config'
import { LOG_LEVELS } from '@ecommerce/logger'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3006),
  KAFKA_BROKER: z.string().default('localhost:9092'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  DEDUPE_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  EMAIL_FROM: z.string().default('"E-commerce" <no-reply@ecommerce.local>'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
})

export const config = envSchema.parse(process.env)

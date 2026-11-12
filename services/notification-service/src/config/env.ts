import { baseConfig, loadConfig } from '@ecommerce/service'
import { z } from 'zod'

export const config = loadConfig(
  baseConfig({ port: 3006 }).extend({
    KAFKA_BROKER: z.string().default('localhost:9092'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    DEDUPE_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    EMAIL_FROM: z.string().default('"E-commerce" <no-reply@ecommerce.local>'),
  }),
)

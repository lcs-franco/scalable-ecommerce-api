import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3006),
  KAFKA_BROKER: z.string().default('localhost:9092'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  EMAIL_FROM: z.string().default('"E-commerce" <no-reply@ecommerce.local>'),
})

export const config = envSchema.parse(process.env)

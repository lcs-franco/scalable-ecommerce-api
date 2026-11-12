import { baseConfig, jwtSecret, loadConfig } from '@ecommerce/service'
import { z } from 'zod'

export const config = loadConfig(
  baseConfig({ port: 3001 }).extend({
    DATABASE_URL: z.string().url(),
    KAFKA_BROKER: z.string().min(1),
    JWT_SECRET: jwtSecret,
  }),
)

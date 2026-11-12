import {
  baseConfig,
  internalServiceToken,
  jwtSecret,
  loadConfig,
} from '@ecommerce/service'
import { z } from 'zod'

export const config = loadConfig(
  baseConfig({ port: 3004 }).extend({
    DATABASE_URL: z.string().url(),
    JWT_SECRET: jwtSecret,
    KAFKA_BROKER: z.string().default('localhost:9092'),
    CART_SERVICE_URL: z.string().url(),
    PRODUCT_SERVICE_URL: z.string().url(),
    INTERNAL_SERVICE_TOKEN: internalServiceToken,
  }),
)

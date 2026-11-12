import {
  baseConfig,
  internalServiceToken,
  jwtSecret,
  loadConfig,
} from '@ecommerce/service'
import { z } from 'zod'

export const config = loadConfig(
  baseConfig({ port: 3003 }).extend({
    REDIS_URL: z.string().min(1),
    JWT_SECRET: jwtSecret,
    PRODUCT_SERVICE_URL: z.string().url(),
    INTERNAL_SERVICE_TOKEN: internalServiceToken,
  }),
)

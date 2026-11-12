import {
  baseConfig,
  internalServiceToken,
  jwtSecret,
  loadConfig,
} from '@ecommerce/service'
import { z } from 'zod'

export const config = loadConfig(
  baseConfig({ port: 3002 }).extend({
    DATABASE_URL: z.string().url(),
    JWT_SECRET: jwtSecret,
    INTERNAL_SERVICE_TOKEN: internalServiceToken,
  }),
)

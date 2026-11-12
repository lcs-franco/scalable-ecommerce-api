import { baseConfig, jwtSecret, loadConfig } from '@ecommerce/service'
import { z } from 'zod'

export const config = loadConfig(
  baseConfig({ port: 3000 }).extend({
    REDIS_URL: z.string().min(1),
    JWT_SECRET: jwtSecret,
    USER_SERVICE_URL: z.string().url().default('http://localhost:3001'),
    PRODUCT_SERVICE_URL: z.string().url().default('http://localhost:3002'),
    CART_SERVICE_URL: z.string().url().default('http://localhost:3003'),
    ORDER_SERVICE_URL: z.string().url().default('http://localhost:3004'),
    PAYMENT_SERVICE_URL: z.string().url().default('http://localhost:3005'),
    RATE_LIMIT_ANONYMOUS: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_AUTHENTICATED: z.coerce.number().int().positive().default(100),
    UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  }),
)

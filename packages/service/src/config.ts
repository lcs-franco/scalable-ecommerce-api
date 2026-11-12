import { LOG_FORMATS, LOG_LEVELS } from '@ecommerce/logger'
import { z } from 'zod'

export const jwtSecret = z
  .string()
  .min(32, 'JWT_SECRET must be at least 32 characters')

export const internalServiceToken = z
  .string()
  .min(16, 'INTERNAL_SERVICE_TOKEN must be at least 16 characters')

export function baseConfig({ port }: { port: number }) {
  return z.object({
    PORT: z.coerce.number().default(port),
    METRICS_PORT: z.coerce.number().default(9464),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    LOG_FORMAT: z.enum(LOG_FORMATS).default('json'),
  })
}

export function loadConfig<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
): z.output<TSchema> {
  const result = schema.safeParse(process.env)

  if (result.success) return result.data

  const invalid = result.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  )

  process.stderr.write(
    `Invalid environment variables:\n${invalid.join('\n')}\n`,
  )

  return process.exit(1)
}

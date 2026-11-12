import type { Database } from '@ecommerce/db'
import { fileURLToPath } from 'node:url'
import type * as schema from './schema.js'

export type Db = Database<typeof schema>

export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
)

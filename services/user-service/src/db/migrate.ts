import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Db } from './index.js'

export async function runMigrations(db: Db) {
  await migrate(db, {
    migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
  })
}

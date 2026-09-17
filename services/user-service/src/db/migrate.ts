import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export async function runMigrations(db: NodePgDatabase) {
  await migrate(db, {
    migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
  })
}

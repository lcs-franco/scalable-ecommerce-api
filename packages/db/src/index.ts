import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

export interface ICreateDbOptions<TSchema extends Record<string, unknown>> {
  url: string
  schema: TSchema
}

export function createDb<TSchema extends Record<string, unknown>>({
  url,
  schema,
}: ICreateDbOptions<TSchema>) {
  const pool = new pg.Pool({ connectionString: url })
  const db = drizzle(pool, { schema })

  return { db, pool }
}

export type Database<TSchema extends Record<string, unknown>> = ReturnType<
  typeof createDb<TSchema>
>['db']

export async function runMigrations(
  db: Database<Record<string, unknown>>,
  migrationsFolder: string,
) {
  await migrate(db, { migrationsFolder })
}

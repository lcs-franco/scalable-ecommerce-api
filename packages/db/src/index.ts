import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

export interface IPoolErrorLog {
  error(fields: { err: Error }, msg: string): void
}

export interface ICreateDbOptions<TSchema extends Record<string, unknown>> {
  url: string
  schema: TSchema
  log: IPoolErrorLog
}

export function createDb<TSchema extends Record<string, unknown>>({
  url,
  schema,
  log,
}: ICreateDbOptions<TSchema>) {
  const pool = new pg.Pool({ connectionString: url })

  // Unhandled, pg's idle-client 'error' event crashes the process; the pool already discards that client.
  pool.on('error', (err) => {
    log.error({ err }, 'idle postgres client lost its connection')
  })

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

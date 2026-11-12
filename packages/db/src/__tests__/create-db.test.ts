import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createDb, type IPoolErrorLog } from '../index.js'

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ecommerce:ecommerce_dev@localhost:5432/postgres'

describe('createDb', () => {
  it('survives an idle client losing its connection and logs the error', async () => {
    const log: IPoolErrorLog = { error: vi.fn() }
    const { db, pool } = createDb({ url: TEST_DATABASE_URL, schema: {}, log })

    try {
      const client = await pool.connect()

      client.release()

      const dropped = new Error(
        'terminating connection due to administrator command',
      )

      expect(() => client.emit('error', dropped)).not.toThrow()
      expect(log.error).toHaveBeenCalledWith(
        { err: dropped },
        'idle postgres client lost its connection',
      )
      expect(pool.totalCount).toBe(0)

      const result = await db.execute(sql`select 1 as ok`)

      expect(result.rows).toEqual([{ ok: 1 }])
    } finally {
      await pool.end()
    }
  })
})

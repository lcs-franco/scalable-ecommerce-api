import { and, asc, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type PgDatabase,
  type PgQueryResultHKT,
} from 'drizzle-orm/pg-core'
import { EVENT_ID_HEADER } from './headers.js'
import type { createProducer } from './producer.js'
import { EventSchemas, type EventData, type TopicName } from './schemas.js'

export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    topic: text('topic').notNull(),
    key: text('key'),
    payload: jsonb('payload').notNull(),
    // clock_timestamp, not now(): rows enqueued in one transaction keep their order
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    index('outbox_pending_idx')
      .on(table.createdAt)
      .where(sql`${table.publishedAt} IS NULL`),
  ],
)

export type OutboxDb = PgDatabase<PgQueryResultHKT, any, any>

export async function enqueue<Topic extends TopicName>(
  db: OutboxDb,
  topic: Topic,
  data: EventData<Topic>,
  options: { key?: string } = {},
) {
  const payload = EventSchemas[topic].parse(data)

  await db.insert(outbox).values({ topic, key: options.key, payload })
}

export type OutboxProducer = Pick<ReturnType<typeof createProducer>, 'publish'>

interface IOutboxRelayOptions {
  db: OutboxDb
  producer: OutboxProducer
  log: {
    info: (obj: object, msg: string) => void
    error: (obj: object, msg: string) => void
  }
  intervalMs?: number
  batchSize?: number
  retentionMs?: number
  purgeIntervalMs?: number
  purgeBatchSize?: number
}

function createLoop(
  run: () => Promise<void>,
  intervalMs: number,
  onError: (err: unknown) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined
  let stopped = true

  async function tick() {
    running = run().catch(onError)
    await running
    running = undefined

    if (!stopped) timer = setTimeout(tick, intervalMs)
  }

  function start() {
    if (!stopped) return

    stopped = false

    if (!running) timer = setTimeout(tick, intervalMs)
  }

  async function stop() {
    stopped = true
    clearTimeout(timer)
    await running
  }

  return { start, stop }
}

export function createOutboxRelay(options: IOutboxRelayOptions) {
  const {
    db,
    producer,
    log,
    intervalMs = 1000,
    batchSize = 100,
    retentionMs = 7 * 24 * 60 * 60 * 1000,
    purgeIntervalMs = 60 * 60 * 1000,
    purgeBatchSize = 1000,
  } = options

  async function publishPending() {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outbox)
        .where(isNull(outbox.publishedAt))
        .orderBy(asc(outbox.createdAt))
        .limit(batchSize)
        .for('update', { skipLocked: true })

      const published: string[] = []

      for (const row of rows) {
        try {
          await producer.publish(
            row.topic as TopicName,
            row.payload as EventData<TopicName>,
            {
              key: row.key ?? undefined,
              headers: { [EVENT_ID_HEADER]: row.id },
            },
          )
        } catch (err) {
          // Stop here so later events never overtake this one
          log.error(
            { err, outboxId: row.id, topic: row.topic },
            'Failed to publish outbox event',
          )
          break
        }

        published.push(row.id)
      }

      if (published.length === 0) return

      await tx
        .update(outbox)
        .set({ publishedAt: sql`now()` })
        .where(inArray(outbox.id, published))
    })
  }

  async function purgeBatch(cutoff: Date) {
    return await db.transaction(async (tx) => {
      const expired = tx
        .select({ id: outbox.id })
        .from(outbox)
        .where(
          and(isNotNull(outbox.publishedAt), lt(outbox.publishedAt, cutoff)),
        )
        .limit(purgeBatchSize)
        .for('update', { skipLocked: true })

      const rows = await tx
        .delete(outbox)
        .where(inArray(outbox.id, expired))
        .returning({ id: outbox.id })

      return rows.length
    })
  }

  async function purgePublished() {
    const cutoff = new Date(Date.now() - retentionMs)
    let deleted = 0
    let batch: number

    do {
      batch = await purgeBatch(cutoff)
      deleted += batch
    } while (batch === purgeBatchSize)

    if (deleted > 0) log.info({ deleted }, 'Purged published outbox events')
  }

  const publishLoop = createLoop(publishPending, intervalMs, (err) =>
    log.error({ err }, 'Outbox relay tick failed'),
  )
  const purgeLoop = createLoop(purgePublished, purgeIntervalMs, (err) =>
    log.error({ err }, 'Outbox purge failed'),
  )

  function start() {
    publishLoop.start()
    purgeLoop.start()
  }

  async function stop() {
    await Promise.all([publishLoop.stop(), purgeLoop.stop()])
  }

  return { start, stop, publishPending, purgePublished }
}

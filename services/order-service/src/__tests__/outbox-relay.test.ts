import { Topics } from '@ecommerce/events'
import {
  createOutboxRelay,
  enqueue,
  outbox,
  type OutboxDb,
  type OutboxProducer,
} from '@ecommerce/events/outbox'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/index.js'
import {
  cleanDb,
  DEFAULT_USER_EMAIL,
  DEFAULT_USER_ID,
  TEST_DATABASE_URL,
} from './helpers.js'

type Published = {
  topic: string
  data: unknown
  key?: string
  eventId?: string
}

function fakeProducer(beforePublish?: (call: Published) => Promise<void>) {
  const published: Published[] = []
  const producer: OutboxProducer = {
    publish: async (topic, data, options) => {
      const call = {
        topic,
        data,
        key: options?.key,
        eventId: options?.headers?.['event-id'],
      }

      await beforePublish?.(call)

      published.push(call)
    },
  }

  return { producer, published }
}

const silentLog = { info: () => {}, error: () => {} }

const DAY_MS = 24 * 60 * 60 * 1000

describe('outbox relay', () => {
  const { db, pool } = createDb(TEST_DATABASE_URL)

  afterEach(async () => {
    await cleanDb(db)
  })

  afterAll(async () => {
    await pool.end()
  })

  function statusChanged(orderId: string, status: 'paid' | 'shipped') {
    return enqueue(
      db,
      Topics.ORDER_STATUS_CHANGED,
      { orderId, userId: DEFAULT_USER_ID, email: DEFAULT_USER_EMAIL, status },
      { key: orderId },
    )
  }

  async function insertRow(createdAt: Date, publishedAt: Date | null) {
    const [row] = await db
      .insert(outbox)
      .values({
        topic: Topics.ORDER_STATUS_CHANGED,
        payload: {},
        createdAt,
        publishedAt,
      })
      .returning({ id: outbox.id })

    return row.id
  }

  function insertPublished(daysAgo: number) {
    const at = new Date(Date.now() - daysAgo * DAY_MS)

    return insertRow(at, at)
  }

  function insertPending(daysAgo: number) {
    return insertRow(new Date(Date.now() - daysAgo * DAY_MS), null)
  }

  async function remainingIds() {
    const rows = await db.select({ id: outbox.id }).from(outbox)

    return rows.map((r) => r.id)
  }

  it('publishes pending events in order with their key and event id', async () => {
    const orderId = crypto.randomUUID()
    await statusChanged(orderId, 'paid')
    await statusChanged(orderId, 'shipped')
    const { producer, published } = fakeProducer()
    const relay = createOutboxRelay({ db, producer, log: silentLog })

    await relay.publishPending()

    expect(published).toEqual([
      {
        topic: Topics.ORDER_STATUS_CHANGED,
        data: expect.objectContaining({ orderId, status: 'paid' }),
        key: orderId,
        eventId: expect.any(String),
      },
      {
        topic: Topics.ORDER_STATUS_CHANGED,
        data: expect.objectContaining({ orderId, status: 'shipped' }),
        key: orderId,
        eventId: expect.any(String),
      },
    ])
    expect(published[0].eventId).not.toBe(published[1].eventId)
  })

  it('stops at a failed publish, logs it and retries from there on the next tick', async () => {
    const orderId = crypto.randomUUID()
    await statusChanged(orderId, 'paid')
    await statusChanged(orderId, 'shipped')
    let brokerDown = true
    const { producer, published } = fakeProducer(async (call) => {
      if (brokerDown && (call.data as { status: string }).status === 'shipped')
        throw new Error('broker down')
    })
    const errors: object[] = []
    const relay = createOutboxRelay({
      db,
      producer,
      log: { ...silentLog, error: (obj) => errors.push(obj) },
    })

    await relay.publishPending()

    expect(published.map((p) => p.data)).toEqual([
      expect.objectContaining({ status: 'paid' }),
    ])
    expect(errors).toEqual([
      expect.objectContaining({ topic: Topics.ORDER_STATUS_CHANGED }),
    ])

    brokerDown = false
    await relay.publishPending()

    expect(published.map((p) => p.data)).toEqual([
      expect.objectContaining({ status: 'paid' }),
      expect.objectContaining({ status: 'shipped' }),
    ])
  })

  it('does not publish an event twice', async () => {
    await statusChanged(crypto.randomUUID(), 'paid')
    const { producer, published } = fakeProducer()
    const relay = createOutboxRelay({ db, producer, log: silentLog })

    await relay.publishPending()
    await relay.publishPending()

    expect(published).toHaveLength(1)
  })

  it('publishes each event once across concurrent relays', async () => {
    for (let i = 0; i < 5; i++) await statusChanged(crypto.randomUUID(), 'paid')
    const slow = () => new Promise<void>((r) => setTimeout(r, 20))
    const a = fakeProducer(slow)
    const b = fakeProducer(slow)

    await Promise.all([
      createOutboxRelay({
        db,
        producer: a.producer,
        log: silentLog,
      }).publishPending(),
      createOutboxRelay({
        db,
        producer: b.producer,
        log: silentLog,
      }).publishPending(),
    ])

    const eventIds = [...a.published, ...b.published].map((p) => p.eventId)

    expect(eventIds).toHaveLength(5)
    expect(new Set(eventIds).size).toBe(5)
  })

  it('publishes on its own once started and finishes the running tick on stop', async () => {
    await statusChanged(crypto.randomUUID(), 'paid')
    let signalStarted: () => void = () => {}
    const started = new Promise<void>((r) => (signalStarted = r))
    const { producer, published } = fakeProducer(async () => {
      signalStarted()
      await new Promise((r) => setTimeout(r, 50))
    })
    const relay = createOutboxRelay({
      db,
      producer,
      log: silentLog,
      intervalMs: 10,
    })

    relay.start()
    await started
    await relay.stop()

    expect(published).toHaveLength(1)

    const next = fakeProducer()
    await createOutboxRelay({
      db,
      producer: next.producer,
      log: silentLog,
    }).publishPending()

    expect(next.published).toEqual([])
  })

  it('purges only rows published before the retention window', async () => {
    const expired = await insertPublished(8)
    const recent = await insertPublished(1)
    const stuck = await insertPending(30)
    const { producer } = fakeProducer()
    const infos: object[] = []
    const relay = createOutboxRelay({
      db,
      producer,
      log: { ...silentLog, info: (obj) => infos.push(obj) },
    })

    await relay.purgePublished()

    const remaining = await remainingIds()

    expect(remaining).not.toContain(expired)
    expect(remaining.sort()).toEqual([recent, stuck].sort())
    expect(infos).toEqual([{ deleted: 1 }])
  })

  it('keeps a row created before the retention window but published within it', async () => {
    const late = await insertRow(
      new Date(Date.now() - 8 * DAY_MS),
      new Date(Date.now() - DAY_MS),
    )
    const { producer } = fakeProducer()
    const relay = createOutboxRelay({ db, producer, log: silentLog })

    await relay.purgePublished()

    expect(await remainingIds()).toEqual([late])
  })

  it('drains a backlog larger than the batch size in one purge', async () => {
    for (let i = 0; i < 5; i++) await insertPublished(8)
    const { producer } = fakeProducer()
    const relay = createOutboxRelay({
      db,
      producer,
      log: silentLog,
      purgeBatchSize: 2,
    })

    await relay.purgePublished()

    expect(await remainingIds()).toEqual([])
  })

  it('finishes the running purge on stop', async () => {
    await insertPublished(8)
    let signalStarted: () => void = () => {}
    const started = new Promise<void>((r) => (signalStarted = r))
    const slowDb: OutboxDb = Object.create(db)
    slowDb.transaction = async (...args) => {
      signalStarted()
      await new Promise((r) => setTimeout(r, 50))

      return db.transaction(...args)
    }
    const { producer } = fakeProducer()
    const relay = createOutboxRelay({
      db: slowDb,
      producer,
      log: silentLog,
      intervalMs: 60_000,
      purgeIntervalMs: 10,
    })

    relay.start()
    await started
    await relay.stop()

    expect(await remainingIds()).toEqual([])
  })
})

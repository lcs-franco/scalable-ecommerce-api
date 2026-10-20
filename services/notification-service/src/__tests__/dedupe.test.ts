import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDeduper } from '../dedupe.js'
import { createRedis } from '../redis.js'
import { cleanRedis, fakeLogger, testRedis } from './helpers.js'

const TTL_SECONDS = 60

describe('createDeduper against Redis', () => {
  const redis = testRedis()

  beforeEach(async () => {
    await cleanRedis(redis)
  })

  afterAll(async () => {
    await cleanRedis(redis)
    await redis.quit()
  })

  it('claims an event id once', async () => {
    const deduper = createDeduper({
      redis,
      ttlSeconds: TTL_SECONDS,
      log: fakeLogger(),
    })
    const eventId = randomUUID()

    expect(await deduper.claim(eventId)).toBe(true)
    expect(await deduper.claim(eventId)).toBe(false)
  })

  it('processes an event without an id and logs at debug', async () => {
    const log = fakeLogger()
    const deduper = createDeduper({ redis, ttlSeconds: TTL_SECONDS, log })

    expect(await deduper.claim(undefined)).toBe(true)
    expect(await deduper.claim(undefined)).toBe(true)
    expect(log.debug).toHaveBeenCalled()
  })

  it('stores the claim with a TTL', async () => {
    const deduper = createDeduper({
      redis,
      ttlSeconds: TTL_SECONDS,
      log: fakeLogger(),
    })
    const eventId = randomUUID()

    await deduper.claim(eventId)

    const ttl = await redis.ttl(`notification:event:${eventId}`)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(TTL_SECONDS)
  })

  it('fails open and logs when Redis is unavailable', async () => {
    const down = createRedis('redis://localhost:1')
    down.on('error', () => {})
    const log = fakeLogger()
    const deduper = createDeduper({ redis: down, ttlSeconds: TTL_SECONDS, log })
    const eventId = randomUUID()

    expect(await deduper.claim(eventId)).toBe(true)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventId }),
      expect.any(String),
    )
    down.disconnect()
  })
})

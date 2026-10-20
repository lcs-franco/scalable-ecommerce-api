import { randomUUID } from 'node:crypto'
import { createServer, type AddressInfo } from 'node:net'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DEDUPE_KEY_PREFIX } from '../dedupe.js'
import { createRedis } from '../redis.js'
import {
  cleanRedis,
  DEDUPE_TTL_SECONDS,
  fakeLogger,
  testDeduper,
  testRedis,
} from './helpers.js'

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
    const deduper = testDeduper(redis)
    const eventId = randomUUID()

    expect(await deduper.claim(eventId)).toBe(true)
    expect(await deduper.claim(eventId)).toBe(false)
  })

  it('processes an event without an id and logs at debug', async () => {
    const log = fakeLogger()
    const deduper = testDeduper(redis, log)

    expect(await deduper.claim(undefined)).toBe(true)
    expect(await deduper.claim(undefined)).toBe(true)
    expect(log.debug).toHaveBeenCalled()
  })

  it('stores the claim with a TTL', async () => {
    const deduper = testDeduper(redis)
    const eventId = randomUUID()

    await deduper.claim(eventId)

    const ttl = await redis.ttl(`${DEDUPE_KEY_PREFIX}${eventId}`)

    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(DEDUPE_TTL_SECONDS)
  })

  it('fails open and logs when Redis is unavailable', async () => {
    const down = createRedis('redis://localhost:1')

    down.on('error', () => {})

    const log = fakeLogger()
    const deduper = testDeduper(down, log)
    const eventId = randomUUID()

    expect(await deduper.claim(eventId)).toBe(true)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventId }),
      expect.any(String),
    )

    down.disconnect()
  })

  it('fails open on the command timeout when Redis never replies', async () => {
    // Accepts connections and never replies, so the ready check and commands hang.
    const server = createServer(() => {})

    await new Promise<void>((resolve) => server.listen(0, resolve))

    const { port } = server.address() as AddressInfo
    const hung = createRedis(`redis://localhost:${port}`)

    hung.on('error', () => {})

    const log = fakeLogger()
    const deduper = testDeduper(hung, log)
    const eventId = randomUUID()

    const startedAt = Date.now()
    const claimed = await deduper.claim(eventId)

    expect(claimed).toBe(true)
    expect(Date.now() - startedAt).toBeLessThan(1500)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventId }),
      expect.any(String),
    )

    hung.disconnect()
    server.close()
  })
})

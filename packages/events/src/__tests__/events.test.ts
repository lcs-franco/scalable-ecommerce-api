import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { EVENT_ID_HEADER } from '../headers.js'
import { createProducer } from '../producer.js'
import { Topics } from '../schemas.js'
import { collectEvents, createTestConsumer, testKafka } from '../testing.js'

const WAIT = { timeout: 10_000 }

function userRegistered() {
  return { userId: randomUUID(), email: 'ana@test.com', name: 'Ana' }
}

describe('events against the broker', () => {
  const kafka = testKafka()
  const producer = createProducer(kafka)
  const rawProducer = kafka.producer()

  beforeAll(async () => {
    await producer.connect()
    await rawProducer.connect()
  })

  afterAll(async () => {
    await producer.disconnect()
    await rawProducer.disconnect()
  })

  it('delivers a published event to a subscribed consumer', async () => {
    const collector = await collectEvents(kafka, Topics.USER_REGISTERED)
    const event = userRegistered()

    await producer.publish(Topics.USER_REGISTERED, event)

    await vi.waitFor(() => expect(collector.events).toContainEqual(event), WAIT)
    await collector.stop()
  })

  it('rejects an invalid payload without sending it', async () => {
    const collector = await collectEvents(kafka, Topics.USER_REGISTERED)
    const userId = randomUUID()
    const invalid = { userId, email: 'not-an-email', name: 'Ana' }
    const valid = { ...userRegistered(), userId }

    await expect(
      producer.publish(Topics.USER_REGISTERED, invalid),
    ).rejects.toThrow(ZodError)
    await producer.publish(Topics.USER_REGISTERED, valid)

    await vi.waitFor(() => expect(collector.events).toContainEqual(valid), WAIT)
    expect(collector.events.filter((e) => e.userId === userId)).toEqual([valid])
    await collector.stop()
  })

  it('skips poison messages, logging them, and keeps consuming', async () => {
    const log = { error: vi.fn() }
    const consumer = await createTestConsumer(kafka, log)
    const received: unknown[] = []
    const valid = userRegistered()

    await consumer.subscribe(Topics.USER_REGISTERED, async (data) => {
      received.push(data)
    })
    await consumer.start()

    await rawProducer.send({
      topic: Topics.USER_REGISTERED,
      messages: [
        { value: 'not json' },
        { value: JSON.stringify({ userId: 'not-a-uuid' }) },
        { value: JSON.stringify(valid) },
      ],
    })

    await vi.waitFor(() => expect(received).toContainEqual(valid), WAIT)
    const skipped = log.error.mock.calls.filter(
      ([, message]) => message === 'Skipping poison message',
    )
    expect(skipped).toHaveLength(2)
    expect(skipped[0][0]).toMatchObject({ topic: Topics.USER_REGISTERED })
    await consumer.disconnect()
  })

  it('passes the event-id header to the handler as meta.eventId', async () => {
    const consumer = await createTestConsumer(kafka)

    const received = new Map<string, string | undefined>()

    await consumer.subscribe(Topics.USER_REGISTERED, async (data, meta) => {
      received.set(data.userId, meta.eventId)
    })

    await consumer.start()

    const withHeader = userRegistered()
    const withoutHeader = userRegistered()
    const eventId = randomUUID()

    await producer.publish(Topics.USER_REGISTERED, withHeader, {
      headers: { [EVENT_ID_HEADER]: eventId },
    })
    await producer.publish(Topics.USER_REGISTERED, withoutHeader)

    await vi.waitFor(() => {
      expect(received.has(withHeader.userId)).toBe(true)
      expect(received.has(withoutHeader.userId)).toBe(true)
    }, WAIT)
    expect(received.get(withHeader.userId)).toBe(eventId)
    expect(received.get(withoutHeader.userId)).toBeUndefined()

    await consumer.disconnect()
  })
})

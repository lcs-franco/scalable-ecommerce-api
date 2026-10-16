import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { createProducer } from '../producer.js'
import { Topics } from '../schemas.js'
import { collectEvents, testKafka } from '../testing.js'

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

  it('skips poison messages and keeps consuming', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const collector = await collectEvents(kafka, Topics.USER_REGISTERED)
    const valid = userRegistered()

    await rawProducer.send({
      topic: Topics.USER_REGISTERED,
      messages: [
        { value: 'not json' },
        { value: JSON.stringify({ userId: 'not-a-uuid' }) },
        { value: JSON.stringify(valid) },
      ],
    })

    await vi.waitFor(() => expect(collector.events).toContainEqual(valid), WAIT)
    const skipped = consoleError.mock.calls.filter(
      ([message]) => message === 'Skipping poison message',
    )
    expect(skipped).toHaveLength(2)
    await collector.stop()
    consoleError.mockRestore()
  })
})

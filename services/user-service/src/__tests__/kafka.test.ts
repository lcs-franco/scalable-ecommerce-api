import { createProducer, Topics } from '@ecommerce/events'
import { collectEvents, testKafka } from '@ecommerce/events/testing'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createPublishers } from '../kafka/publishers.js'
import { cleanDb, createTestApp } from './helpers.js'

describe('user-service on the broker', () => {
  const kafka = testKafka()
  const producer = createProducer(kafka)
  let ctx: Awaited<ReturnType<typeof createTestApp>>

  beforeAll(async () => {
    await producer.connect()
    ctx = await createTestApp({ publishers: createPublishers(producer) })
  })

  afterEach(async () => {
    await cleanDb(ctx.db)
  })

  afterAll(async () => {
    await producer.disconnect()
    await ctx.app.close()
    await ctx.pool.end()
  })

  it('publishes user.registered on register', async () => {
    const registered = await collectEvents(kafka, Topics.USER_REGISTERED)
    const email = `${crypto.randomUUID()}@test.com`

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/register',
      payload: { email, password: 'password123', name: 'Ana' },
    })

    expect(res.statusCode).toBe(201)
    await vi.waitFor(
      () =>
        expect(registered.events.find((e) => e.email === email)).toMatchObject({
          name: 'Ana',
          userId: expect.any(String),
        }),
      { timeout: 10_000 },
    )
    await registered.stop()
  })
})

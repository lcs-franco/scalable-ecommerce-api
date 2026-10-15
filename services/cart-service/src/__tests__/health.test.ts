import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './helpers.js'

describe('GET /health', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterAll(async () => {
    await ctx.app.close()
    await ctx.redis.quit()
  })

  it('returns ok without a token', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})

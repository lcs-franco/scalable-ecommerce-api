import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './helpers.js'

describe('GET /health', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterAll(async () => {
    await ctx.app.close()
    await ctx.pool.end()
  })

  it('returns ok without a token', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('should use a valid incoming x-request-id as the request id', async () => {
    const incoming = '4f1c2a9e-8b3d-4e5f-9a6b-7c8d9e0f1a2b'

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': incoming },
    })

    expect(res.headers['x-request-id']).toBe(incoming)
  })
})

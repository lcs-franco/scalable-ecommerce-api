import { createLogger } from '@ecommerce/logger'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = await buildApp({
      logger: createLogger({
        service: 'notification-service',
        level: 'silent',
      }),
    })

    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})

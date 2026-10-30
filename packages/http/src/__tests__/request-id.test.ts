import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { genRequestId, registerRequestId } from '../index.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function createTestApp() {
  const app = Fastify({ genReqId: genRequestId })

  registerRequestId(app)

  app.get('/id', async (request) => ({ id: request.id }))

  return app
}

describe('request id', () => {
  it('should use a valid incoming x-request-id and echo it', async () => {
    const app = await createTestApp()
    const incoming = '4f1c2a9e-8b3d-4e5f-9a6b-7c8d9e0f1a2b'

    const res = await app.inject({
      method: 'GET',
      url: '/id',
      headers: { 'x-request-id': incoming },
    })

    expect(res.json()).toEqual({ id: incoming })
    expect(res.headers['x-request-id']).toBe(incoming)
  })

  it.each([
    ['an invalid', { 'x-request-id': 'not-a-uuid' }],
    ['a missing', {}],
  ])('should generate a new id for %s header', async (_label, headers) => {
    const app = await createTestApp()

    const res = await app.inject({ method: 'GET', url: '/id', headers })

    const { id } = res.json<{ id: string }>()
    expect(id).toMatch(UUID)
    expect(id).not.toBe('not-a-uuid')
    expect(res.headers['x-request-id']).toBe(id)
  })

  it('should generate a different id per request', async () => {
    const app = await createTestApp()

    const first = await app.inject({ method: 'GET', url: '/id' })
    const second = await app.inject({ method: 'GET', url: '/id' })

    expect(first.json()).not.toEqual(second.json())
  })
})

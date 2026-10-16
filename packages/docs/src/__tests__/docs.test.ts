import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { docsPlugin } from '../index.js'

async function getSpec() {
  const app = Fastify()
  await app.register(docsPlugin, { title: 'test' })
  app.get('/private', async () => ({}))
  app.get('/public', { config: { skipAuth: true } }, async () => ({}))
  app.post('/internal', { config: { internal: true } }, async () => ({}))
  await app.ready()
  const spec = app.swagger() as {
    paths: Record<string, Record<string, { security?: unknown[] }>>
  }
  await app.close()
  return spec
}

describe('docsPlugin', () => {
  it('hides internal routes', async () => {
    const spec = await getSpec()

    expect(spec.paths['/internal']).toBeUndefined()
    expect(spec.paths['/private']).toBeDefined()
  })

  it('marks public routes as not needing bearerAuth', async () => {
    const spec = await getSpec()

    expect(spec.paths['/public'].get.security).toEqual([])
    expect(spec.paths['/private'].get.security).toBeUndefined()
  })
})

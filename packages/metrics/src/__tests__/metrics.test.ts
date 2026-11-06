import Fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { metricsPlugin, observeOutbox, startMetricsServer } from '../index.js'

let server: Awaited<ReturnType<typeof startMetricsServer>>

async function scrape() {
  const res = await fetch(`http://127.0.0.1:${server.port}/metrics`)

  return res.text()
}

function sampleValue(text: string, name: string, labels: string[]) {
  const line = text
    .split('\n')
    .find(
      (l) =>
        l.startsWith(`${name}{`) && labels.every((label) => l.includes(label)),
    )

  return line === undefined ? undefined : Number(line.split(' ').pop())
}

async function createTestApp() {
  const app = Fastify()

  await app.register(metricsPlugin)

  app.get('/items/:id', async () => ({ ok: true }))

  return app
}

beforeAll(async () => {
  server = await startMetricsServer({ port: 0, service: 'test-service' })
})

afterAll(async () => {
  await server.close()
})

describe('metrics', () => {
  it('should count a request by method, route template and status', async () => {
    const app = await createTestApp()

    await app.inject({ method: 'GET', url: '/items/42' })
    await app.inject({ method: 'GET', url: '/items/43' })

    const count = sampleValue(
      await scrape(),
      'http_request_duration_seconds_count',
      [
        'method="GET"',
        'route="/items/:id"',
        'status_code="200"',
        'service="test-service"',
      ],
    )

    expect(count).toBe(2)
  })

  it('should collapse unmatched urls into a single route label', async () => {
    const app = await createTestApp()

    await app.inject({ method: 'GET', url: '/random-a' })
    await app.inject({ method: 'GET', url: '/random-b' })

    const text = await scrape()

    expect(
      sampleValue(text, 'http_request_duration_seconds_count', [
        'route="__unmatched__"',
        'status_code="404"',
      ]),
    ).toBe(2)
    expect(text).not.toContain('/random-a')
  })

  it('should keep serving metrics when the outbox backlog cannot be read', async () => {
    const app = await createTestApp()

    observeOutbox(() => Promise.reject(new Error('database is down')))

    await app.inject({ method: 'GET', url: '/items/44' })

    const res = await fetch(`http://127.0.0.1:${server.port}/metrics`)
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toMatch(/^outbox_pending_events\{[^}]*\} nan$/im)
    expect(text).toContain('route="/items/:id"')
  })

  it('should answer 404 for any other path on the metrics port', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`)

    expect(res.status).toBe(404)
  })
})

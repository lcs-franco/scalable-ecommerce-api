import Fastify from 'fastify'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { authPlugin, INTERNAL_TOKEN_HEADER } from '../index.js'

const INTERNAL_TOKEN = 'test-internal-service-token'

beforeAll(() => {
  process.env.JWT_SECRET ??= 'test-secret-must-be-at-least-32-chars!'
})

async function createTestApp(
  { internalToken }: { internalToken?: string } = {
    internalToken: INTERNAL_TOKEN,
  },
) {
  const app = Fastify()
  await app.register(authPlugin, { internalToken })
  app.get('/private', async () => ({ ok: true }))
  app.post('/internal', { config: { internal: true } }, async () => ({
    ok: true,
  }))
  await app.ready()
  return app
}

let app: Awaited<ReturnType<typeof createTestApp>>

afterEach(async () => {
  await app?.close()
})

function userJwt() {
  return app.jwt.sign({ userId: 'user-id', email: 'u@test.com', role: 'user' })
}

function callInternal(headers: Record<string, string> = {}) {
  return app.inject({ method: 'POST', url: '/internal', headers })
}

function callPrivate(headers: Record<string, string> = {}) {
  return app.inject({ method: 'GET', url: '/private', headers })
}

describe('internal routes', () => {
  it('rejects a request without the internal token', async () => {
    app = await createTestApp()
    const res = await callInternal()

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('INTERNAL_TOKEN_INVALID')
  })

  it('rejects a wrong internal token', async () => {
    app = await createTestApp()
    const res = await callInternal({ [INTERNAL_TOKEN_HEADER]: 'wrong-token' })

    expect(res.statusCode).toBe(401)
  })

  it('rejects a token that differs only in length', async () => {
    app = await createTestApp()
    const res = await callInternal({
      [INTERNAL_TOKEN_HEADER]: `${INTERNAL_TOKEN}x`,
    })

    expect(res.statusCode).toBe(401)
  })

  it('accepts the correct internal token', async () => {
    app = await createTestApp()
    const res = await callInternal({ [INTERNAL_TOKEN_HEADER]: INTERNAL_TOKEN })

    expect(res.statusCode).toBe(200)
  })

  it('rejects a user JWT', async () => {
    app = await createTestApp()
    const res = await callInternal({ authorization: `Bearer ${userJwt()}` })

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('INTERNAL_TOKEN_INVALID')
  })
})

describe('JWT routes', () => {
  it('still require a JWT', async () => {
    app = await createTestApp()
    const res = await callPrivate()

    expect(res.statusCode).toBe(401)
  })

  it('do not accept the internal token', async () => {
    app = await createTestApp()
    const res = await callPrivate({ [INTERNAL_TOKEN_HEADER]: INTERNAL_TOKEN })

    expect(res.statusCode).toBe(401)
  })

  it('accept a valid JWT', async () => {
    app = await createTestApp()
    const res = await callPrivate({ authorization: `Bearer ${userJwt()}` })

    expect(res.statusCode).toBe(200)
  })
})

describe('route registration', () => {
  it('fails for an internal route without the internalToken option', async () => {
    await expect(createTestApp({})).rejects.toThrow(
      'internal routes need the internalToken option',
    )
  })

  it('fails for an internal route that also sets skipAuth', async () => {
    const instance = Fastify()
    await instance.register(authPlugin, { internalToken: INTERNAL_TOKEN })

    expect(() =>
      instance.post(
        '/both',
        { config: { internal: true, skipAuth: true } },
        async () => ({}),
      ),
    ).toThrow('internal routes cannot set skipAuth')
    await instance.close()
  })
})

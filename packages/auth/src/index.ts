import { timingSafeEqual } from 'node:crypto'
import createError from '@fastify/error'
import fjwt from '@fastify/jwt'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export type { FastifyJWT } from '@fastify/jwt'

export interface ITokenPayload {
  userId: string
  email: string
  role: 'user' | 'admin'
}

const ACCESS_TOKEN_EXPIRY = 900 // 15 minutes in seconds

export const INTERNAL_TOKEN_HEADER = 'x-internal-token'

declare module '@fastify/jwt' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyJWT {
    payload: ITokenPayload
    user: ITokenPayload
  }
}

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyContextConfig {
    skipAuth?: boolean
    internal?: boolean
  }
}

const InvalidInternalToken = createError(
  'INTERNAL_TOKEN_INVALID',
  'Invalid or missing internal service token',
  401,
)

export interface IAuthOptions {
  publicPrefixes?: string[]
  internalToken?: string
}

function isPublicPath(url: string, publicPrefixes: string[]) {
  const path = url.split('?')[0]
  return publicPrefixes.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/'),
  )
}

function isValidInternalToken(header: unknown, expected: Buffer) {
  if (typeof header !== 'string') return false
  const received = Buffer.from(header)
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  )
}

export const authPlugin = fp<IAuthOptions>(
  async function auth(app: FastifyInstance, opts) {
    const { publicPrefixes = [], internalToken } = opts
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET env var is required')
    const expectedToken = internalToken ? Buffer.from(internalToken) : null

    app.register(fjwt, { secret, sign: { expiresIn: ACCESS_TOKEN_EXPIRY } })

    app.addHook('onRoute', (route) => {
      if (!route.config?.internal) return
      const name = `${route.method} ${route.url}`
      if (route.config.skipAuth) {
        throw new Error(`${name}: internal routes cannot set skipAuth`)
      }
      if (!expectedToken) {
        throw new Error(
          `${name}: internal routes need the internalToken option`,
        )
      }
    })

    app.addHook('onRequest', async (request, _reply) => {
      const config = request.routeOptions.config
      if (config.internal) {
        const header = request.headers[INTERNAL_TOKEN_HEADER]
        if (!expectedToken || !isValidInternalToken(header, expectedToken)) {
          throw new InvalidInternalToken()
        }
        return
      }
      if (config.skipAuth) return
      if (isPublicPath(request.url, publicPrefixes)) return

      await request.jwtVerify()
    })
  },
  { name: 'auth' },
)

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

declare module '@fastify/jwt' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface FastifyJWT {
    payload: ITokenPayload
    user: ITokenPayload
  }
}

export interface IAuthOptions {
  publicPrefixes?: string[]
}

function isPublicPath(url: string, publicPrefixes: string[]) {
  const path = url.split('?')[0]
  return publicPrefixes.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/'),
  )
}

export const authPlugin = fp<IAuthOptions>(
  async function auth(app: FastifyInstance, opts) {
    const { publicPrefixes = [] } = opts
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET env var is required')

    app.register(fjwt, { secret, sign: { expiresIn: ACCESS_TOKEN_EXPIRY } })

    app.addHook('onRequest', async (request, _reply) => {
      if ((request.routeOptions.config as any)?.skipAuth) return
      if (isPublicPath(request.url, publicPrefixes)) return

      await request.jwtVerify()
    })
  },
  { name: 'auth' },
)

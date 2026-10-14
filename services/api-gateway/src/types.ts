/* eslint-disable @typescript-eslint/naming-convention */
import type { Access } from './routes/table.js'

export interface ITokenPayload {
  userId: string
  email: string
  role: 'user' | 'admin'
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: ITokenPayload
    user: ITokenPayload
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    identity: ITokenPayload | null
    authError: string | null
  }

  interface FastifyContextConfig {
    access?: Access
    rateLimit?: boolean
  }
}

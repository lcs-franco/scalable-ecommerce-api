import '@ecommerce/auth'
import type { FastifyInstance } from 'fastify'
import type { createAuthService } from '../services/auth.service.js'
import type { createUserService } from '../services/user.service.js'
import {
  RegisterBodySchema,
  LoginBodySchema,
  RefreshBodySchema,
} from '../schemas/auth.schemas.js'

interface IDeps {
  authService: ReturnType<typeof createAuthService>
  userService: ReturnType<typeof createUserService>
  publishUserRegistered: (data: {
    userId: string
    email: string
    name: string
  }) => Promise<void>
}

export async function authRoutes(app: FastifyInstance, deps: IDeps) {
  const { authService, userService, publishUserRegistered } = deps

  app.post(
    '/register',
    { config: { skipAuth: true } },
    async (request, reply) => {
      const body = RegisterBodySchema.parse(request.body)
      const user = await userService.create(
        body.email,
        body.password,
        body.name,
      )

      await publishUserRegistered({
        userId: user.id,
        email: user.email,
        name: user.name,
      })

      return reply.status(201).send({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      })
    },
  )

  app.post('/login', { config: { skipAuth: true } }, async (request, reply) => {
    const body = LoginBodySchema.parse(request.body)
    const tokens = await authService.login(body.email, body.password)
    return reply.send(tokens)
  })

  app.post(
    '/refresh',
    { config: { skipAuth: true } },
    async (request, reply) => {
      const body = RefreshBodySchema.parse(request.body)
      const tokens = await authService.refresh(body.refreshToken)
      return reply.send(tokens)
    },
  )

  app.post('/logout', async (request, reply) => {
    const { userId } = request.user
    await authService.logout(userId)
    return reply.status(204).send()
  })
}

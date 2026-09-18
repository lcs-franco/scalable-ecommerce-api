import '@ecommerce/auth'
import { Topics } from '@ecommerce/events'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { createAuthService } from '../../services/auth.service.js'
import type { createUserService } from '../../services/user.service.js'
import {
  LoginBodySchema,
  RefreshBodySchema,
  RegisterBodySchema,
} from './schemas/auth.schemas.js'

interface IDeps extends FastifyPluginOptions {
  authService: ReturnType<typeof createAuthService>
  userService: ReturnType<typeof createUserService>
  publishUserRegistered: (data: {
    userId: string
    email: string
    name: string
  }) => Promise<void>
}

export async function authRoutes(fastify: FastifyInstance, deps: IDeps) {
  const { authService, userService, publishUserRegistered } = deps
  const app = fastify.withTypeProvider<ZodTypeProvider>()

  app.post(
    '/register',
    { config: { skipAuth: true }, schema: { body: RegisterBodySchema } },
    async (request, reply) => {
      const { email, password, name } = request.body
      const user = await userService.create(email, password, name)
      const tokens = await authService.generateTokens(user)

      try {
        await publishUserRegistered({
          userId: user.id,
          email: user.email,
          name: user.name,
        })
      } catch (err) {
        app.log.error(
          { err, userId: user.id },
          `Failed to publish ${Topics.USER_REGISTERED} event`,
        )
      }

      return reply.status(201).send(tokens)
    },
  )

  app.post(
    '/login',
    { config: { skipAuth: true }, schema: { body: LoginBodySchema } },
    async (request, reply) => {
      const { email, password } = request.body
      const tokens = await authService.login(email, password)
      return reply.send(tokens)
    },
  )

  app.post(
    '/refresh',
    { config: { skipAuth: true }, schema: { body: RefreshBodySchema } },
    async (request, reply) => {
      const { refreshToken } = request.body
      const tokens = await authService.refresh(refreshToken)
      return reply.send(tokens)
    },
  )

  app.post('/logout', async (request, reply) => {
    const { userId } = request.user
    await authService.logout(userId)
    return reply.status(204).send()
  })
}

import '@ecommerce/auth'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { createUserService } from '../../services/user.service.js'
import { UpdateProfileBodySchema } from './schemas/profile.schemas.js'

interface IDeps {
  userService: ReturnType<typeof createUserService>
}

export async function profileRoutes(fastify: FastifyInstance, deps: IDeps) {
  const app = fastify.withTypeProvider<ZodTypeProvider>()
  const { userService } = deps

  app.get('/profile', async (request, reply) => {
    const user = await userService.findById(request.user.userId)

    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })
  })

  app.patch(
    '/profile',
    { schema: { body: UpdateProfileBodySchema } },
    async (request, reply) => {
      const updatedUser = await userService.updateProfile(
        request.user.userId,
        request.body,
      )

      return reply.send({
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
      })
    },
  )
}

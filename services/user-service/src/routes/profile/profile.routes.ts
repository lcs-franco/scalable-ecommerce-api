import '@ecommerce/auth'
import type { FastifyInstance } from 'fastify'
import { UserNotFound } from '../../errors/index.js'
import { UpdateProfileBodySchema } from './schemas/profile.schemas.js'
import type { createUserService } from '../../services/user.service.js'

interface IDeps {
  userService: ReturnType<typeof createUserService>
}

export async function profileRoutes(app: FastifyInstance, deps: IDeps) {
  const { userService } = deps

  app.get('/profile', async (request, reply) => {
    const user = await userService.findById(request.user.userId)
    if (!user) throw new UserNotFound()

    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })
  })

  app.patch('/profile', async (request, reply) => {
    const body = UpdateProfileBodySchema.parse(request.body)

    const updatedUser = await userService.updateProfile(
      request.user.userId,
      body,
    )

    reply.send({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
    })
  })
}

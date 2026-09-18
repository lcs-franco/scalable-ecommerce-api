import '@fastify/jwt'
import { and, eq, gt } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { createHash, randomUUID } from 'node:crypto'
import type { Db } from '../db/index.js'
import { refreshTokens } from '../db/schema.js'
import { InvalidCredentials, InvalidRefreshToken } from '../errors/index.js'
import { createUserService } from './user.service.js'

const REFRESH_TOKEN_EXPIRY_DAYS = 7

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function createAuthService(
  db: Db,
  app: FastifyInstance,
  userService: ReturnType<typeof createUserService>,
) {
  async function generateTokens(user: {
    id: string
    email: string
    role: 'user' | 'admin'
  }) {
    const accessToken = app.jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    const rawRefreshToken = randomUUID()
    const hashedToken = hashToken(rawRefreshToken)
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    )

    await db.insert(refreshTokens).values({
      userId: user.id,
      token: hashedToken,
      expiresAt,
    })

    return { accessToken, refreshToken: rawRefreshToken }
  }

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await userService.findByEmail(email)
    if (!user) throw new InvalidCredentials()

    const verifiedPassword = await userService.verifyPassword(
      user.passwordHash,
      password,
    )
    if (!verifiedPassword) throw new InvalidCredentials()

    return generateTokens(user)
  }

  async function refresh(rawRefreshToken: string) {
    const hashed = hashToken(rawRefreshToken)
    const deleted = await db
      .delete(refreshTokens)
      .where(
        and(
          eq(refreshTokens.token, hashed),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .returning()

    const consumed = deleted[0]
    if (!consumed) throw new InvalidRefreshToken()

    const user = await userService.findById(consumed.userId)

    return generateTokens(user)
  }

  async function logout(userId: string) {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
  }

  return { generateTokens, login, refresh, logout }
}

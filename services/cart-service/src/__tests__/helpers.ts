import { Redis } from 'ioredis'
import { buildApp } from '../app.js'

process.env.JWT_SECRET ??= 'test-secret-must-be-at-least-32-chars!'

const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380'

export async function createTestApp() {
  const redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 3 })

  // Use a mock product service URL — tests that need enrichment will
  // override via `createTestAppWithProductServer`
  const app = await buildApp({
    redis,
    productServiceUrl: 'http://localhost:19999',
  })
  await app.ready()

  return { app, redis }
}

export function userToken(
  app: Awaited<ReturnType<typeof createTestApp>>['app'],
  userId = 'user-id',
) {
  return app.jwt.sign({
    userId,
    email: 'user@test.com',
    role: 'user',
  })
}

export async function cleanRedis(redis: Redis) {
  const keys = await redis.keys('cart:*')
  if (keys.length > 0) await redis.del(...keys)
}

import type { Logger } from '@ecommerce/logger'
import { vi } from 'vitest'
import type {
  IEmailMessage,
  IEmailProvider,
} from '../providers/email-provider.js'
import { createRedis, type RedisClient } from '../redis.js'

const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380'

export const USER_ID = '00000000-0000-0000-0000-000000000002'
export const ORDER_ID = '11111111-2222-3333-4444-555555555555'
export const PAYMENT_ID = '66666666-7777-8888-9999-000000000000'
export const PRODUCT_ID = '00000000-0000-0000-0000-0000000000aa'
export const EMAIL = 'user@test.com'

export function fakeEmailProvider() {
  const sent: IEmailMessage[] = []
  let failure: Error | undefined

  const provider: IEmailProvider = {
    send: async (message) => {
      if (failure) throw failure
      sent.push(message)
    },
  }

  return {
    provider,
    sent,
    failWith(error: Error) {
      failure = error
    },
  }
}

export function fakeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger & {
    debug: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
  }
}

export function testRedis() {
  return createRedis(TEST_REDIS_URL)
}

export async function cleanRedis(redis: RedisClient) {
  const keys = await redis.keys('notification:event:*')

  if (keys.length > 0) await redis.del(...keys)
}

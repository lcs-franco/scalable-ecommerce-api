import type { Logger } from '@ecommerce/logger'
import { vi } from 'vitest'
import type {
  IEmailMessage,
  IEmailProvider,
} from '../providers/email-provider.js'

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
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger & {
    info: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
  }
}

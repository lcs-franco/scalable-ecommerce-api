import type { Logger } from '@ecommerce/logger'
import type { ISmsProvider } from './sms-provider.js'

export function createConsoleSmsProvider(log: Logger): ISmsProvider {
  return {
    async send(phone, message) {
      log.info({ phone, message }, 'SMS sent (console)')
    },
  }
}

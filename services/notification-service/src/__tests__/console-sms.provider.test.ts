import { describe, expect, it } from 'vitest'
import { createConsoleSmsProvider } from '../providers/console-sms.provider.js'
import { fakeLogger } from './helpers.js'

describe('ConsoleSmsProvider', () => {
  it('logs the phone and message instead of sending', async () => {
    const log = fakeLogger()
    const sms = createConsoleSmsProvider(log)

    await sms.send('+5511999999999', 'Your order shipped')

    expect(log.info).toHaveBeenCalledWith(
      { phone: '+5511999999999', message: 'Your order shipped' },
      'SMS sent (console)',
    )
  })
})

import { type createConsumer, Topics } from '@ecommerce/events'
import { describe, expect, it, vi } from 'vitest'
import { setupConsumers } from '../kafka/consumers.js'
import { createNotificationService } from '../services/notification.service.js'
import { fakeEmailProvider, fakeLogger } from './helpers.js'

describe('setupConsumers', () => {
  it('routes each topic to its handler and starts consuming', async () => {
    const consumer = {
      subscribe: vi.fn(),
      start: vi.fn(),
    } as unknown as ReturnType<typeof createConsumer>
    const notificationService = createNotificationService({
      email: fakeEmailProvider().provider,
      log: fakeLogger(),
    })

    await setupConsumers({ consumer, notificationService })

    const routes = Object.fromEntries(vi.mocked(consumer.subscribe).mock.calls)
    expect(routes).toEqual({
      [Topics.USER_REGISTERED]: notificationService.onUserRegistered,
      [Topics.ORDER_PLACED]: notificationService.onOrderPlaced,
      [Topics.PAYMENT_CONFIRMED]: notificationService.onPaymentConfirmed,
      [Topics.PAYMENT_FAILED]: notificationService.onPaymentFailed,
      [Topics.ORDER_STATUS_CHANGED]: notificationService.onOrderStatusChanged,
    })
    expect(consumer.start).toHaveBeenCalledOnce()
  })
})

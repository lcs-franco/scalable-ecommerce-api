import { type createConsumer, type IEventMeta, Topics } from '@ecommerce/events'
import type { Deduper } from '../dedupe.js'
import type { NotificationService } from '../services/notification.service.js'

interface IDeps {
  consumer: ReturnType<typeof createConsumer>
  notificationService: NotificationService
  deduper: Deduper
}

export async function setupConsumers(deps: IDeps) {
  const { consumer, notificationService, deduper } = deps

  const deduped =
    <T>(handler: (data: T) => Promise<void>) =>
    async (data: T, meta: IEventMeta) => {
      if (!(await deduper.claim(meta.eventId))) return

      await handler(data)
    }

  await consumer.subscribe(
    Topics.USER_REGISTERED,
    deduped(notificationService.onUserRegistered),
  )
  await consumer.subscribe(
    Topics.ORDER_PLACED,
    deduped(notificationService.onOrderPlaced),
  )
  await consumer.subscribe(
    Topics.PAYMENT_CONFIRMED,
    deduped(notificationService.onPaymentConfirmed),
  )
  await consumer.subscribe(
    Topics.PAYMENT_FAILED,
    deduped(notificationService.onPaymentFailed),
  )
  await consumer.subscribe(
    Topics.ORDER_STATUS_CHANGED,
    deduped(notificationService.onOrderStatusChanged),
  )

  await consumer.start()
}

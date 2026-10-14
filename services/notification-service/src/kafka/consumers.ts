import { type createConsumer, Topics } from '@ecommerce/events'
import type { NotificationService } from '../services/notification.service.js'

interface IDeps {
  consumer: ReturnType<typeof createConsumer>
  notificationService: NotificationService
}

export async function setupConsumers(deps: IDeps) {
  const { consumer, notificationService: notify } = deps

  await consumer.subscribe(Topics.USER_REGISTERED, notify.onUserRegistered)
  await consumer.subscribe(Topics.ORDER_PLACED, notify.onOrderPlaced)
  await consumer.subscribe(Topics.PAYMENT_CONFIRMED, notify.onPaymentConfirmed)
  await consumer.subscribe(Topics.PAYMENT_FAILED, notify.onPaymentFailed)
  await consumer.subscribe(
    Topics.ORDER_STATUS_CHANGED,
    notify.onOrderStatusChanged,
  )

  await consumer.start()
}

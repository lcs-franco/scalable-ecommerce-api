import { type createConsumer, Topics } from '@ecommerce/events'
import type { NotificationService } from '../services/notification.service.js'

interface IDeps {
  consumer: ReturnType<typeof createConsumer>
  notificationService: NotificationService
}

export async function setupConsumers(deps: IDeps) {
  const { consumer, notificationService } = deps

  await consumer.subscribe(
    Topics.USER_REGISTERED,
    notificationService.onUserRegistered,
  )
  await consumer.subscribe(
    Topics.ORDER_PLACED,
    notificationService.onOrderPlaced,
  )
  await consumer.subscribe(
    Topics.PAYMENT_CONFIRMED,
    notificationService.onPaymentConfirmed,
  )
  await consumer.subscribe(
    Topics.PAYMENT_FAILED,
    notificationService.onPaymentFailed,
  )
  await consumer.subscribe(
    Topics.ORDER_STATUS_CHANGED,
    notificationService.onOrderStatusChanged,
  )

  await consumer.start()
}

import { type EventData, type TopicName, Topics } from '@ecommerce/events'
import type { Logger } from '@ecommerce/logger'
import {
  type IEmailContent,
  isNotifiedStatus,
  orderConfirmationEmail,
  orderStatusEmail,
  paymentConfirmedEmail,
  paymentFailedEmail,
  welcomeEmail,
} from '../emails/index.js'
import type { IEmailProvider } from '../providers/email-provider.js'

interface IDeps {
  email: IEmailProvider
  log: Logger
}

// The fields every notified event carries: who to email and what to log.
interface INotifiedEvent {
  email: string
  userId: string
  orderId?: string
}

export type NotificationService = ReturnType<typeof createNotificationService>

export function createNotificationService(deps: IDeps) {
  const { email, log } = deps

  async function deliver(
    topic: TopicName,
    event: INotifiedEvent,
    content: Promise<IEmailContent>,
  ): Promise<void> {
    try {
      await email.send({ to: event.email, ...(await content) })
    } catch (err) {
      log.error(
        { err, topic, userId: event.userId, orderId: event.orderId },
        'Failed to send email',
      )
    }
  }

  return {
    onUserRegistered: (data: EventData<typeof Topics.USER_REGISTERED>) =>
      deliver(Topics.USER_REGISTERED, data, welcomeEmail(data)),

    onOrderPlaced: (data: EventData<typeof Topics.ORDER_PLACED>) =>
      deliver(Topics.ORDER_PLACED, data, orderConfirmationEmail(data)),

    onPaymentConfirmed: (data: EventData<typeof Topics.PAYMENT_CONFIRMED>) =>
      deliver(Topics.PAYMENT_CONFIRMED, data, paymentConfirmedEmail(data)),

    onPaymentFailed: (data: EventData<typeof Topics.PAYMENT_FAILED>) =>
      deliver(Topics.PAYMENT_FAILED, data, paymentFailedEmail(data)),

    // paid/cancelled are already covered by the payment emails.
    onOrderStatusChanged: async (
      data: EventData<typeof Topics.ORDER_STATUS_CHANGED>,
    ) => {
      if (!isNotifiedStatus(data.status)) return

      await deliver(
        Topics.ORDER_STATUS_CHANGED,
        data,
        orderStatusEmail({ ...data, status: data.status }),
      )
    },
  }
}

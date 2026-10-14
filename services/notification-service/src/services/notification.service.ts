import type { EventData, TopicName, Topics } from '@ecommerce/events'
import type { Logger } from '@ecommerce/logger'
import {
  type IEmailContent,
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

interface IDeliveryContext {
  topic: TopicName
  userId: string
  orderId?: string
}

export type NotificationService = ReturnType<typeof createNotificationService>

export function createNotificationService(deps: IDeps) {
  const { email, log } = deps

  async function deliver(
    to: string,
    content: Promise<IEmailContent>,
    context: IDeliveryContext,
  ): Promise<void> {
    try {
      await email.send({ to, ...(await content) })
    } catch (err) {
      log.error({ err, ...context }, 'Failed to send email')
    }
  }

  return {
    onUserRegistered: (data: EventData<typeof Topics.USER_REGISTERED>) =>
      deliver(data.email, welcomeEmail(data), {
        topic: 'user.registered',
        userId: data.userId,
      }),

    onOrderPlaced: (data: EventData<typeof Topics.ORDER_PLACED>) =>
      deliver(data.email, orderConfirmationEmail(data), {
        topic: 'order.placed',
        userId: data.userId,
        orderId: data.orderId,
      }),

    onPaymentConfirmed: (data: EventData<typeof Topics.PAYMENT_CONFIRMED>) =>
      deliver(data.email, paymentConfirmedEmail(data), {
        topic: 'payment.confirmed',
        userId: data.userId,
        orderId: data.orderId,
      }),

    onPaymentFailed: (data: EventData<typeof Topics.PAYMENT_FAILED>) =>
      deliver(data.email, paymentFailedEmail(data), {
        topic: 'payment.failed',
        userId: data.userId,
        orderId: data.orderId,
      }),

    // paid/cancelled are already covered by the payment emails.
    onOrderStatusChanged: async (
      data: EventData<typeof Topics.ORDER_STATUS_CHANGED>,
    ) => {
      if (data.status !== 'shipped' && data.status !== 'delivered') return

      await deliver(
        data.email,
        orderStatusEmail({ ...data, status: data.status }),
        {
          topic: 'order.status-changed',
          userId: data.userId,
          orderId: data.orderId,
        },
      )
    },
  }
}

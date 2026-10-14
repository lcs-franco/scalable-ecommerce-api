import type { EventData, Topics } from '@ecommerce/events'
import { render } from 'react-email'
import { shortId } from './format.js'
import { OrderConfirmationEmail } from './order-confirmation.js'
import {
  type NotifiedStatus,
  OrderStatusEmail,
  STATUS_MESSAGES,
} from './order-status.js'
import { PaymentConfirmedEmail } from './payment-confirmed.js'
import { PaymentFailedEmail } from './payment-failed.js'
import { WelcomeEmail } from './welcome.js'

export type { NotifiedStatus } from './order-status.js'

export interface IEmailContent {
  subject: string
  html: string
}

export async function welcomeEmail(
  data: EventData<typeof Topics.USER_REGISTERED>,
): Promise<IEmailContent> {
  return {
    subject: 'Welcome to E-commerce',
    html: await render(<WelcomeEmail name={data.name} />),
  }
}

export async function orderConfirmationEmail(
  data: EventData<typeof Topics.ORDER_PLACED>,
): Promise<IEmailContent> {
  return {
    subject: `Order ${shortId(data.orderId)} confirmed`,
    html: await render(<OrderConfirmationEmail {...data} />),
  }
}

export async function paymentConfirmedEmail(
  data: EventData<typeof Topics.PAYMENT_CONFIRMED>,
): Promise<IEmailContent> {
  return {
    subject: `Payment received for order ${shortId(data.orderId)}`,
    html: await render(
      <PaymentConfirmedEmail orderId={data.orderId} amount={data.amount} />,
    ),
  }
}

export async function paymentFailedEmail(
  data: EventData<typeof Topics.PAYMENT_FAILED>,
): Promise<IEmailContent> {
  return {
    subject: `Payment failed for order ${shortId(data.orderId)}`,
    html: await render(
      <PaymentFailedEmail orderId={data.orderId} reason={data.reason} />,
    ),
  }
}

export async function orderStatusEmail(data: {
  orderId: string
  status: NotifiedStatus
}): Promise<IEmailContent> {
  return {
    subject: `Order ${shortId(data.orderId)} ${STATUS_MESSAGES[data.status]}`,
    html: await render(
      <OrderStatusEmail orderId={data.orderId} status={data.status} />,
    ),
  }
}

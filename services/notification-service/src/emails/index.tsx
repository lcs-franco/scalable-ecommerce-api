import type { EventData, Topics } from '@ecommerce/events'
import type { ReactElement } from 'react'
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

export { isNotifiedStatus, type NotifiedStatus } from './order-status.js'

export interface IEmailContent {
  subject: string
  html: string
}

export type NotifiedStatusChange = Omit<
  EventData<typeof Topics.ORDER_STATUS_CHANGED>,
  'status'
> & { status: NotifiedStatus }

async function compose(
  subject: string,
  body: ReactElement,
): Promise<IEmailContent> {
  return { subject, html: await render(body) }
}

export function welcomeEmail(
  data: EventData<typeof Topics.USER_REGISTERED>,
): Promise<IEmailContent> {
  return compose('Welcome to E-commerce', <WelcomeEmail name={data.name} />)
}

export function orderConfirmationEmail(
  data: EventData<typeof Topics.ORDER_PLACED>,
): Promise<IEmailContent> {
  return compose(
    `Order ${shortId(data.orderId)} confirmed`,
    <OrderConfirmationEmail {...data} />,
  )
}

export function paymentConfirmedEmail(
  data: EventData<typeof Topics.PAYMENT_CONFIRMED>,
): Promise<IEmailContent> {
  return compose(
    `Payment received for order ${shortId(data.orderId)}`,
    <PaymentConfirmedEmail orderId={data.orderId} amount={data.amount} />,
  )
}

export function paymentFailedEmail(
  data: EventData<typeof Topics.PAYMENT_FAILED>,
): Promise<IEmailContent> {
  return compose(
    `Payment failed for order ${shortId(data.orderId)}`,
    <PaymentFailedEmail orderId={data.orderId} reason={data.reason} />,
  )
}

export function orderStatusEmail(
  data: NotifiedStatusChange,
): Promise<IEmailContent> {
  return compose(
    `Order ${shortId(data.orderId)} ${STATUS_MESSAGES[data.status]}`,
    <OrderStatusEmail orderId={data.orderId} status={data.status} />,
  )
}

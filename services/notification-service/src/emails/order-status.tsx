import { Heading, Text } from 'react-email'
import { EmailLayout } from './layout.js'

export type NotifiedStatus = 'shipped' | 'delivered'

export const STATUS_MESSAGES: Record<NotifiedStatus, string> = {
  shipped: 'is on its way',
  delivered: 'was delivered',
}

export function isNotifiedStatus(status: string): status is NotifiedStatus {
  return Object.hasOwn(STATUS_MESSAGES, status)
}

interface IOrderStatusEmailProps {
  orderId: string
  status: NotifiedStatus
}

export function OrderStatusEmail({ orderId, status }: IOrderStatusEmailProps) {
  return (
    <EmailLayout preview={`Your order ${STATUS_MESSAGES[status]}`}>
      <Heading className="text-2xl capitalize text-gray-900">{status}</Heading>
      <Text className="text-gray-700">
        Your order <strong>{orderId}</strong> {STATUS_MESSAGES[status]}.
      </Text>
    </EmailLayout>
  )
}

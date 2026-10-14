import { Heading, Text } from 'react-email'
import { formatCents } from './format.js'
import { EmailLayout } from './layout.js'

interface IPaymentConfirmedEmailProps {
  orderId: string
  amount: number
}

export function PaymentConfirmedEmail({
  orderId,
  amount,
}: IPaymentConfirmedEmailProps) {
  return (
    <EmailLayout preview={`Payment of ${formatCents(amount)} received`}>
      <Heading className="text-2xl text-gray-900">Payment received</Heading>
      <Text className="text-gray-700">
        Your payment of <strong>{formatCents(amount)}</strong> for order{' '}
        <strong>{orderId}</strong> was confirmed.
      </Text>
    </EmailLayout>
  )
}

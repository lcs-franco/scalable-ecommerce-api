import { Heading, Text } from 'react-email'
import { EmailLayout } from './layout.js'

interface IPaymentFailedEmailProps {
  orderId: string
  reason: string
}

export function PaymentFailedEmail({
  orderId,
  reason,
}: IPaymentFailedEmailProps) {
  return (
    <EmailLayout preview="We could not charge your payment">
      <Heading className="text-2xl text-red-700">Payment failed</Heading>
      <Text className="text-gray-700">
        We could not charge your payment for order <strong>{orderId}</strong>.
      </Text>
      <Text className="rounded bg-red-50 p-3 text-red-800">
        Reason: {reason}
      </Text>
      <Text className="text-gray-700">
        The order was cancelled. Please place it again with another payment
        method.
      </Text>
    </EmailLayout>
  )
}

import type { EventData, Topics } from '@ecommerce/events'
import { Column, Heading, Row, Section, Text } from 'react-email'
import { formatCents } from './format.js'
import { EmailLayout } from './layout.js'

type OrderConfirmationEmailProps = Pick<
  EventData<typeof Topics.ORDER_PLACED>,
  'orderId' | 'items' | 'total'
>

export function OrderConfirmationEmail({
  orderId,
  items,
  total,
}: OrderConfirmationEmailProps) {
  return (
    <EmailLayout preview={`We received your order of ${formatCents(total)}`}>
      <Heading className="text-2xl text-gray-900">Order confirmed</Heading>
      <Text className="text-gray-700">
        We received your order <strong>{orderId}</strong>.
      </Text>
      <Section className="my-4">
        <Row className="text-sm font-semibold text-gray-500">
          <Column>Product</Column>
          <Column className="w-16 text-center">Qty</Column>
          <Column className="w-24 text-right">Subtotal</Column>
        </Row>
        {items.map((item) => (
          <Row key={item.productId} className="text-gray-900">
            <Column>{item.name}</Column>
            <Column className="w-16 text-center">{item.quantity}</Column>
            <Column className="w-24 text-right">
              {formatCents(item.price * item.quantity)}
            </Column>
          </Row>
        ))}
      </Section>
      <Text className="text-right text-lg font-bold text-gray-900">
        Total: {formatCents(total)}
      </Text>
    </EmailLayout>
  )
}

import { z } from 'zod'

export const Topics = {
  USER_REGISTERED: 'user.registered',
  ORDER_PLACED: 'order.placed',
  PAYMENT_CONFIRMED: 'payment.confirmed',
  PAYMENT_FAILED: 'payment.failed',
  ORDER_STATUS_CHANGED: 'order.status-changed',
} as const

export type TopicName = (typeof Topics)[keyof typeof Topics]

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const UserRegisteredSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
})

export const RecipientSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
})

export const OrderPlacedSchema = z
  .object({
    orderId: z.string().uuid(),
    items: z.array(
      z.object({
        productId: z.string().uuid(),
        name: z.string(),
        quantity: z.number().int(),
        price: z.number().int(),
      }),
    ),
    total: z.number().int(),
    paymentMethodId: z.string().min(1),
  })
  .merge(RecipientSchema)

export const PaymentConfirmedSchema = z
  .object({
    orderId: z.string().uuid(),
    paymentId: z.string().uuid(),
    amount: z.number().int(),
    provider: z.string(),
  })
  .merge(RecipientSchema)

export const PaymentFailedSchema = z
  .object({
    orderId: z.string().uuid(),
    paymentId: z.string().uuid(),
    reason: z.string(),
  })
  .merge(RecipientSchema)

export const OrderStatusChangedSchema = z
  .object({
    orderId: z.string().uuid(),
    status: z.enum(ORDER_STATUSES),
  })
  .merge(RecipientSchema)

export const EventSchemas = {
  [Topics.USER_REGISTERED]: UserRegisteredSchema,
  [Topics.ORDER_PLACED]: OrderPlacedSchema,
  [Topics.PAYMENT_CONFIRMED]: PaymentConfirmedSchema,
  [Topics.PAYMENT_FAILED]: PaymentFailedSchema,
  [Topics.ORDER_STATUS_CHANGED]: OrderStatusChangedSchema,
} as const

export type EventData<T extends TopicName> = z.infer<(typeof EventSchemas)[T]>

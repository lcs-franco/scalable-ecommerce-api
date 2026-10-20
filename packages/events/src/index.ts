export { createConsumer, type IEventMeta } from './consumer.js'
export { createProducer } from './producer.js'
export {
  EventSchemas,
  OrderPlacedSchema,
  OrderStatusChangedSchema,
  PaymentConfirmedSchema,
  PaymentFailedSchema,
  RecipientSchema,
  Topics,
  UserRegisteredSchema,
  type EventData,
  type TopicName,
} from './schemas.js'

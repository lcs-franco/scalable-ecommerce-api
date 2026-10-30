export { createConsumer, type IEventMeta } from './consumer.js'
export { EVENT_ID_HEADER } from './headers.js'
export { createKafkaLogCreator, type IKafkaLogTarget } from './kafka-log.js'
export { createProducer } from './producer.js'
export {
  EventSchemas,
  ORDER_STATUSES,
  OrderPlacedSchema,
  OrderStatusChangedSchema,
  PaymentConfirmedSchema,
  PaymentFailedSchema,
  RecipientSchema,
  Topics,
  UserRegisteredSchema,
  type EventData,
  type OrderStatus,
  type TopicName,
} from './schemas.js'

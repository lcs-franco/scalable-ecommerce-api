export {
  createConsumer,
  type IConsumerOptions,
  type IEventMeta,
  type IProcessedEvent,
  type ProcessedOutcome,
} from './consumer.js'
export { EVENT_ID_HEADER } from './headers.js'
export { createKafka, type ICreateKafkaOptions } from './kafka.js'
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

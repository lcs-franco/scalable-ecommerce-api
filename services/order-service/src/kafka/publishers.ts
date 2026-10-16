import { type createProducer, type EventData, Topics } from '@ecommerce/events'

export function createPublishers(producer: ReturnType<typeof createProducer>) {
  return {
    publishOrderPlaced: (data: EventData<typeof Topics.ORDER_PLACED>) =>
      producer.publish(Topics.ORDER_PLACED, data),
    publishOrderStatusChanged: (
      data: EventData<typeof Topics.ORDER_STATUS_CHANGED>,
    ) => producer.publish(Topics.ORDER_STATUS_CHANGED, data),
  }
}

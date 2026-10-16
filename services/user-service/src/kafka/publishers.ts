import { type createProducer, type EventData, Topics } from '@ecommerce/events'

export function createPublishers(producer: ReturnType<typeof createProducer>) {
  return {
    publishUserRegistered: (data: EventData<typeof Topics.USER_REGISTERED>) =>
      producer.publish(Topics.USER_REGISTERED, data),
  }
}

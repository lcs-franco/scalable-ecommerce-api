import type { ConsumerConfig, Kafka } from 'kafkajs'
import { EVENT_ID_HEADER } from './headers.js'
import { type EventData, EventSchemas, type TopicName } from './schemas.js'

export interface IEventMeta {
  eventId?: string
}

type Handler<T extends TopicName = TopicName> = (
  data: EventData<T>,
  meta: IEventMeta,
) => Promise<void>

export function createConsumer(
  kafka: Kafka,
  groupId: string,
  config?: Omit<ConsumerConfig, 'groupId'>,
) {
  const consumer = kafka.consumer({ ...config, groupId })
  const handlers = new Map<TopicName, Handler>()

  const connect = () => consumer.connect()
  const disconnect = () => consumer.disconnect()

  const subscribe = async <Topic extends TopicName>(
    topic: Topic,
    handler: (data: EventData<Topic>, meta: IEventMeta) => Promise<void>,
  ) => {
    await consumer.subscribe({ topic })
    handlers.set(topic, handler)
  }

  const start = async () => {
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return

        const handler = handlers.get(topic as TopicName)
        if (!handler) return

        let validated: EventData<TopicName>
        try {
          const parsed = JSON.parse(message.value.toString())
          validated = EventSchemas[topic as TopicName].parse(parsed)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Skipping poison message', {
            topic,
            partition,
            offset: message.offset,
            error: err,
          })
          return
        }

        const eventId = message.headers?.[EVENT_ID_HEADER]?.toString()

        await handler(validated, { eventId })
      },
    })
  }

  return { connect, disconnect, subscribe, start }
}

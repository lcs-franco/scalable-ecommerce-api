import { Kafka } from 'kafkajs'
import { type EventData, EventSchemas, type TopicName } from './schemas.js'

type Handler<T extends TopicName = TopicName> = (
  data: EventData<T>,
) => Promise<void>

export function createConsumer(kafka: Kafka, groupId: string) {
  const consumer = kafka.consumer({ groupId })
  const handlers = new Map<TopicName, Handler>()

  const connect = () => consumer.connect()
  const disconnect = () => consumer.disconnect()

  const subscribe = async <Topic extends TopicName>(
    topic: Topic,
    handler: (data: EventData<Topic>) => Promise<void>,
  ) => {
    await consumer.subscribe({ topic })
    handlers.set(topic, handler)
  }

  const start = async () => {
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return

        const handler = handlers.get(topic as TopicName)
        if (!handler) return

        const parsed = JSON.parse(message.value.toString())
        const validated = EventSchemas[topic as TopicName].parse(parsed)
        await handler(validated)
      },
    })
  }

  return { connect, disconnect, subscribe, start }
}

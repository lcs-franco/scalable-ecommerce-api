import { Kafka, Partitioners } from 'kafkajs'
import { EventSchemas, type EventData, type TopicName } from './schemas.js'

export function createProducer(kafka: Kafka) {
  const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
  })

  const connect = () => producer.connect()
  const disconnect = () => producer.disconnect()

  const publish = async <Topic extends TopicName>(
    topic: Topic,
    payload: EventData<Topic>,
    options: { key?: string; headers?: Record<string, string> } = {},
  ) => {
    const parsed = EventSchemas[topic].parse(payload)

    await producer.send({
      topic,
      messages: [{ ...options, value: JSON.stringify(parsed) }],
    })
  }

  return { connect, disconnect, publish }
}

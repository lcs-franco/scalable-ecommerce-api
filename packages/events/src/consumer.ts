import type { ConsumerConfig, Kafka } from 'kafkajs'
import { EVENT_ID_HEADER } from './headers.js'
import type { IKafkaLogTarget } from './kafka-log.js'
import { type EventData, EventSchemas, type TopicName } from './schemas.js'

export interface IEventMeta {
  eventId?: string
}

type Handler<T extends TopicName = TopicName> = (
  data: EventData<T>,
  meta: IEventMeta,
) => Promise<void>

export type ProcessedOutcome = 'ok' | 'error' | 'poison'

export interface IProcessedEvent {
  topic: string
  durationMs: number
  outcome: ProcessedOutcome
}

export interface IConsumerOptions extends Omit<ConsumerConfig, 'groupId'> {
  onProcessed?: (event: IProcessedEvent) => void
}

export function createConsumer(
  kafka: Kafka,
  groupId: string,
  log: Pick<IKafkaLogTarget, 'error'>,
  options: IConsumerOptions = {},
) {
  const { onProcessed, ...config } = options

  const consumer = kafka.consumer({ ...config, groupId })
  const handlers = new Map<TopicName, Handler>()

  const connect = () => consumer.connect()
  const disconnect = () => consumer.disconnect()

  const subscribe = async <Topic extends TopicName>(
    topic: Topic,
    handler: Handler<Topic>,
  ) => {
    await consumer.subscribe({ topic })
    handlers.set(topic, handler as Handler)
  }

  const start = async () => {
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return

        const handler = handlers.get(topic as TopicName)
        if (!handler) return

        const startedAt = performance.now()

        const report = (outcome: ProcessedOutcome) =>
          onProcessed?.({
            topic,
            durationMs: performance.now() - startedAt,
            outcome,
          })

        let validated: EventData<TopicName>

        try {
          const parsed = JSON.parse(message.value.toString())

          validated = EventSchemas[topic as TopicName].parse(parsed)
        } catch (err) {
          log.error(
            { topic, partition, offset: message.offset, err },
            'Skipping poison message',
          )
          report('poison')

          return
        }

        const eventId = message.headers?.[EVENT_ID_HEADER]?.toString()

        try {
          await handler(validated, { eventId })
        } catch (err) {
          report('error')

          throw err
        }

        report('ok')
      },
    })
  }

  return { connect, disconnect, subscribe, start }
}

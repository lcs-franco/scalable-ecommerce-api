import { randomUUID } from 'node:crypto'
import { Kafka, logLevel } from 'kafkajs'
import { createConsumer } from './consumer.js'
import { type EventData, Topics, type TopicName } from './schemas.js'

export function testKafka() {
  return new Kafka({
    clientId: 'test',
    brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
    logLevel: logLevel.ERROR,
  })
}

// Shorter long-poll: disconnect waits for the in-flight fetch.
const FAST_FETCH = { maxWaitTimeInMs: 100 }

// A new group's "latest" is resolved after the join and loses early messages; commit the end offsets instead.
async function pinGroupToEnd(kafka: Kafka, groupId: string) {
  const topics = Object.values(Topics)
  const admin = kafka.admin()
  await admin.connect()
  const ends = await Promise.all(
    topics.map(async (topic) => ({
      topic,
      partitions: await admin.fetchTopicOffsets(topic),
    })),
  )
  await admin.disconnect()

  const consumer = kafka.consumer({ groupId, ...FAST_FETCH })
  await consumer.connect()
  await consumer.subscribe({ topics })
  const fetched = new Promise((resolve) =>
    consumer.on(consumer.events.FETCH, resolve),
  )
  // Not awaited: seeks must be queued before the first fetch (same order as admin.setOffsets).
  const running = consumer.run({
    eachBatchAutoResolve: false,
    eachBatch: async () => {},
  })
  consumer.pause(topics.map((topic) => ({ topic })))
  for (const { topic, partitions } of ends) {
    for (const { partition, high } of partitions) {
      consumer.seek({ topic, partition, offset: high })
    }
  }
  await Promise.all([running, fetched])
  await consumer.disconnect()
}

export async function createTestConsumer(kafka: Kafka) {
  const groupId = `test-${randomUUID()}`
  await pinGroupToEnd(kafka, groupId)
  const consumer = createConsumer(kafka, groupId, FAST_FETCH)
  await consumer.connect()
  return consumer
}

// Topics are shared across test files: filter `events` by an id the test owns.
export async function collectEvents<Topic extends TopicName>(
  kafka: Kafka,
  topic: Topic,
) {
  const consumer = await createTestConsumer(kafka)
  const events: EventData<Topic>[] = []
  await consumer.subscribe(topic, async (data) => {
    events.push(data)
  })
  await consumer.start()
  return { events, stop: () => consumer.disconnect() }
}

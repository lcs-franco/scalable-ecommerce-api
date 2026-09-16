import { Kafka } from "kafkajs";
import { EventSchemas, type EventData, type TopicName } from "./schemas.js";

export function createProducer(kafka: Kafka) {
  const producer = kafka.producer();

  const connect = () => producer.connect();
  const disconnect = () => producer.disconnect();

  const publish = async <Topic extends TopicName>(
    topic: Topic,
    payload: EventData<Topic>,
  ) => {
    const parsed = EventSchemas[topic].parse(payload);

    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(parsed) }],
    });
  };

  return { connect, disconnect, publish };
}

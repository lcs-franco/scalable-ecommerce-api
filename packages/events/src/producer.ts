import { Kafka } from "kafkajs";
import { EventSchemas, type TopicName } from "./schemas.js";

export function createProducer(kafka: Kafka) {
  const producer = kafka.producer();

  const connect = () => producer.connect();
  const disconnect = () => producer.disconnect();

  const publish = async (topic: TopicName, data: any) => {
    const parsed = EventSchemas[topic].parse(data);

    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(parsed) }],
    });
  };

  return { connect, disconnect, publish };
}

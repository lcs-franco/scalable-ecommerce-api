import { Kafka } from "kafkajs";
import { EventSchemas, type TopicName } from "./schemas.js";

export function createConsumer(kafka: Kafka, groupId: string) {
  const consumer = kafka.consumer({ groupId });

  const connect = () => consumer.connect();
  const disconnect = () => consumer.disconnect();

  const subscribe = async (
    topic: TopicName,
    handler: (data: unknown) => Promise<void>,
  ) => {
    await consumer.subscribe({ topic });

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const parsed = JSON.parse(message.value.toString());

        const validated = EventSchemas[topic].parse(parsed);

        await handler(validated);
      },
    });
  };

  return { connect, disconnect, subscribe };
}

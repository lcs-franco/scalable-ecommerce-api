import { Kafka, logLevel } from 'kafkajs'
import { createKafkaLogCreator, type IKafkaLogTarget } from './kafka-log.js'

export interface ICreateKafkaOptions {
  service: string
  broker: string
  log: IKafkaLogTarget
}

export function createKafka({ service, broker, log }: ICreateKafkaOptions) {
  return new Kafka({
    clientId: service,
    brokers: [broker],
    logCreator: createKafkaLogCreator(log),
    // DEBUG so Pino's level does the filtering
    logLevel: logLevel.DEBUG,
  })
}

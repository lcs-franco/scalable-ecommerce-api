import { logLevel, type logCreator } from 'kafkajs'

type LogMethod = (fields: object, msg: string) => void

export interface IKafkaLogTarget {
  child(bindings: Record<string, unknown>): IKafkaLogTarget
  error: LogMethod
  warn: LogMethod
  info: LogMethod
  debug: LogMethod
}

const METHODS: Partial<Record<logLevel, 'error' | 'warn' | 'info' | 'debug'>> =
  {
    [logLevel.ERROR]: 'error',
    [logLevel.WARN]: 'warn',
    [logLevel.INFO]: 'info',
    [logLevel.DEBUG]: 'debug',
  }

export function createKafkaLogCreator(logger: IKafkaLogTarget): logCreator {
  return () => {
    const children = new Map<string, IKafkaLogTarget>()

    const childFor = (namespace: string) => {
      let child = children.get(namespace)

      if (!child) {
        child = logger.child({ kafka: namespace })
        children.set(namespace, child)
      }

      return child
    }

    return ({ namespace, level, log }) => {
      const method = METHODS[level]

      if (!method) return

      const { message, timestamp: _timestamp, logger: _logger, ...fields } = log

      childFor(namespace)[method](fields, message)
    }
  }
}

import { logLevel, type LogEntry } from 'kafkajs'
import { describe, expect, it, vi } from 'vitest'
import { createKafkaLogCreator, type IKafkaLogTarget } from '../kafka-log.js'

interface ILine {
  bindings: Record<string, unknown>
  level: string
  fields: object
  msg: string
}

function fakeLogger(
  bindings: Record<string, unknown> = {},
  lines: ILine[] = [],
) {
  const write = (level: string) => (fields: object, msg: string) => {
    lines.push({ bindings, level, fields, msg })
  }

  const logger: IKafkaLogTarget = {
    child: (extra) => fakeLogger({ ...bindings, ...extra }, lines).logger,
    error: write('error'),
    warn: write('warn'),
    info: write('info'),
    debug: write('debug'),
  }

  return { logger, lines }
}

function entry(level: logLevel, log: Record<string, unknown> = {}): LogEntry {
  return {
    namespace: 'Consumer',
    level,
    label: 'INFO',
    log: {
      timestamp: '2026-10-22T12:00:00.000Z',
      logger: 'kafkajs',
      message: 'Starting',
      ...log,
    },
  }
}

describe('createKafkaLogCreator', () => {
  it('maps each KafkaJS level to the matching logger method', () => {
    const { logger, lines } = fakeLogger()
    const log = createKafkaLogCreator(logger)(logLevel.DEBUG)

    log(entry(logLevel.ERROR))
    log(entry(logLevel.WARN))
    log(entry(logLevel.INFO))
    log(entry(logLevel.DEBUG))

    expect(lines.map((line) => line.level)).toEqual([
      'error',
      'warn',
      'info',
      'debug',
    ])
  })

  it('logs nothing for the NOTHING level', () => {
    const { logger, lines } = fakeLogger()
    const log = createKafkaLogCreator(logger)(logLevel.DEBUG)

    log(entry(logLevel.NOTHING))

    expect(lines).toEqual([])
  })

  it('logs through a child bound to the KafkaJS namespace', () => {
    const { logger, lines } = fakeLogger({ name: 'order-service' })
    const log = createKafkaLogCreator(logger)(logLevel.DEBUG)

    log({ ...entry(logLevel.INFO), namespace: 'Runner' })

    expect(lines[0].bindings).toEqual({
      name: 'order-service',
      kafka: 'Runner',
    })
  })

  it('creates one child per namespace', () => {
    const { logger } = fakeLogger()
    const child = vi.spyOn(logger, 'child')
    const log = createKafkaLogCreator(logger)(logLevel.DEBUG)

    log({ ...entry(logLevel.INFO), namespace: 'Runner' })
    log({ ...entry(logLevel.DEBUG), namespace: 'Runner' })
    log({ ...entry(logLevel.INFO), namespace: 'Consumer' })

    expect(child.mock.calls).toEqual([
      [{ kafka: 'Runner' }],
      [{ kafka: 'Consumer' }],
    ])
  })

  it('uses the message as msg, keeps the other fields and drops timestamp and logger', () => {
    const { logger, lines } = fakeLogger()
    const log = createKafkaLogCreator(logger)(logLevel.DEBUG)

    log(
      entry(logLevel.WARN, {
        message: 'Crash: KafkaJSNumberOfRetriesExceeded',
        groupId: 'order-service',
        retryCount: 5,
      }),
    )

    expect(lines).toEqual([
      {
        bindings: { kafka: 'Consumer' },
        level: 'warn',
        fields: { groupId: 'order-service', retryCount: 5 },
        msg: 'Crash: KafkaJSNumberOfRetriesExceeded',
      },
    ])
  })
})

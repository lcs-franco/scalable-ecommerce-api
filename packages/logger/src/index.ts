import pino, { type DestinationStream, type Logger } from 'pino'
import pretty from 'pino-pretty'

export type { Logger } from 'pino'

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

export const LOG_FORMATS = ['json', 'pretty'] as const

export type LogFormat = (typeof LOG_FORMATS)[number]

export interface ICreateLoggerOptions {
  service: string
  level?: LogLevel
  format?: LogFormat
}

export function createLogger(
  opts: ICreateLoggerOptions,
  destination: DestinationStream = pino.destination(1),
): Logger {
  const level = opts.level ?? process.env.LOG_LEVEL ?? 'info'

  const output =
    opts.format === 'pretty'
      ? pretty({ colorize: true, destination })
      : destination

  return pino(
    {
      name: opts.service,
      level,
      formatters: {
        level(label) {
          return { level: label }
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    output,
  )
}

import pino, { type Logger, type LoggerOptions } from 'pino'

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

export interface ICreateLoggerOptions {
  service: string
  level?: LogLevel
}

function getLoggerConfig(opts: ICreateLoggerOptions): LoggerOptions {
  const level = opts.level ?? process.env.LOG_LEVEL ?? 'info'

  return {
    name: opts.service,
    level,
    formatters: {
      level(label) {
        return { level: label }
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport:
      process.env.NODE_ENV !== 'production' && level !== 'silent'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  }
}

export function createLogger(opts: ICreateLoggerOptions): Logger {
  return pino(getLoggerConfig(opts))
}

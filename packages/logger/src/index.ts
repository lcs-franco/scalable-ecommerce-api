import pino, { type Logger, type LoggerOptions } from 'pino'

export type { Logger } from 'pino'

export interface ICreateLoggerOptions {
  service: string
  level?: string
}

export function getLoggerConfig(opts: ICreateLoggerOptions): LoggerOptions {
  return {
    name: opts.service,
    level: opts.level ?? process.env.LOG_LEVEL ?? 'info',
    formatters: {
      level(label) {
        return { level: label }
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  }
}

export function createLogger(opts: ICreateLoggerOptions): Logger {
  return pino(getLoggerConfig(opts))
}

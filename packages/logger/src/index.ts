import pino, { type Logger, type LoggerOptions } from "pino";

export type { Logger } from "pino";

export interface CreateLoggerOptions {
  service: string;
  level?: string;
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const config: LoggerOptions = {
    name: opts.service,
    level: opts.level ?? process.env.LOG_LEVEL ?? "info",
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return pino(config);
}

import { createLogger, type Logger, type LogLevel } from '@ecommerce/logger'
import { startMetricsServer } from '@ecommerce/metrics'
import type { FastifyInstance } from 'fastify'

// Docker's default stop grace period is 10s
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8_000

type Task = () => unknown

interface INamedTask {
  name: string
  run: Task
}

export interface IServiceConfig {
  PORT: number
  METRICS_PORT: number
  LOG_LEVEL: LogLevel
}

export interface IServiceProcess {
  on(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown
  exit(code: number): void
}

export interface IServiceContext {
  log: Logger
  onClose(name: string, close: Task): void
  afterListen(start: Task): void
}

export interface IRunServiceOptions {
  name: string
  config: IServiceConfig
  shutdownTimeoutMs?: number
  process?: IServiceProcess
}

async function closeEach(closes: INamedTask[], log: Logger) {
  let failed = false

  for (const close of closes) {
    try {
      await close.run()
      log.info({ resource: close.name }, 'closed')
    } catch (err) {
      failed = true
      log.error({ err, resource: close.name }, 'close failed')
    }
  }

  return failed
}

async function closeWithin(
  closes: INamedTask[],
  log: Logger,
  timeoutMs: number,
) {
  let timer: NodeJS.Timeout | undefined

  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      log.error({ timeoutMs }, 'shutdown timed out')
      resolve(true)
    }, timeoutMs)
  })

  try {
    return await Promise.race([closeEach(closes, log), timedOut])
  } finally {
    clearTimeout(timer)
  }
}

export async function runService(
  opts: IRunServiceOptions,
  setup: (ctx: IServiceContext) => Promise<FastifyInstance>,
) {
  const { name, config } = opts
  const proc = opts.process ?? process
  const log = createLogger({ service: name, level: config.LOG_LEVEL })

  const resources: INamedTask[] = []
  const starts: Task[] = []
  const servers: INamedTask[] = []
  let stopping = false

  const stop = async (exitCode: number) => {
    if (stopping) return

    stopping = true

    const closes = [...servers, ...[...resources].reverse()]
    const failed = await closeWithin(
      closes,
      log,
      opts.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
    )

    proc.exit(failed ? 1 : exitCode)
  }

  const onSignal = (signal: 'SIGTERM' | 'SIGINT') => {
    log.info({ signal }, 'shutting down')
    void stop(0)
  }

  proc.on('SIGTERM', () => onSignal('SIGTERM'))
  proc.on('SIGINT', () => onSignal('SIGINT'))

  try {
    const app = await setup({
      log,
      onClose: (resource, run) => resources.push({ name: resource, run }),
      afterListen: (start) => starts.push(start),
    })

    servers.push({ name: 'app', run: () => app.close() })

    const metrics = await startMetricsServer({
      port: config.METRICS_PORT,
      service: name,
    })

    servers.push({ name: 'metrics server', run: metrics.close })

    await app.listen({ port: config.PORT, host: '0.0.0.0' })

    for (const start of starts) await start()

    log.info({ port: config.PORT }, 'service started')
  } catch (err) {
    log.fatal({ err }, 'startup failed')
    await stop(1)
  }
}

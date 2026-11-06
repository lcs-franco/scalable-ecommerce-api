import fp from 'fastify-plugin'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { collectDefaultMetrics, Gauge, Histogram, register } from 'prom-client'

const DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
]

// One label for every 404, or random urls would create unbounded series
const UNMATCHED_ROUTE = '__unmatched__'

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration by method, route template and status code',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: DURATION_BUCKETS,
})

export const metricsPlugin = fp(
  async function metrics(app) {
    app.addHook('onResponse', async (request, reply) => {
      httpDuration.observe(
        {
          method: request.method,
          route: request.routeOptions.url ?? UNMATCHED_ROUTE,
          status_code: reply.statusCode,
        },
        reply.elapsedTime / 1000,
      )
    })
  },
  { name: 'metrics' },
)

export interface IPoolStats {
  totalCount: number
  idleCount: number
  waitingCount: number
}

export function observePgPool(pool: IPoolStats) {
  const gauges = [
    ['pg_pool_total_connections', 'Open connections', 'totalCount'],
    ['pg_pool_idle_connections', 'Idle connections', 'idleCount'],
    [
      'pg_pool_waiting_clients',
      'Clients waiting for a connection',
      'waitingCount',
    ],
  ] as const

  for (const [name, help, key] of gauges) {
    new Gauge({
      name,
      help,
      collect() {
        this.set(pool[key])
      },
    })
  }
}

export interface IOutboxBacklog {
  pending: number
  oldestAgeSeconds: number
}

const UNREADABLE: IOutboxBacklog = { pending: NaN, oldestAgeSeconds: NaN }

// Read at scrape time so the values stay right while the relay is stuck
export function observeOutbox(readBacklog: () => Promise<IOutboxBacklog>) {
  let inFlight: Promise<IOutboxBacklog> | undefined

  // Both gauges collect concurrently: one query per scrape, NaN when it fails
  const read = () =>
    (inFlight ??= readBacklog()
      .catch(() => UNREADABLE)
      .finally(() => {
        inFlight = undefined
      }))

  new Gauge({
    name: 'outbox_pending_events',
    help: 'Outbox rows not yet published (NaN when unreadable)',
    async collect() {
      this.set((await read()).pending)
    },
  })

  new Gauge({
    name: 'outbox_oldest_pending_age_seconds',
    help: 'Age of the oldest unpublished outbox row (0 when empty)',
    async collect() {
      this.set((await read()).oldestAgeSeconds)
    },
  })
}

export interface IProcessedEvent {
  topic: string
  durationMs: number
  outcome: 'ok' | 'error' | 'poison'
}

export function consumerMetrics() {
  const duration = new Histogram({
    name: 'kafka_consumer_processing_seconds',
    help: 'Kafka message processing duration by topic and outcome',
    labelNames: ['topic', 'outcome'] as const,
    buckets: DURATION_BUCKETS,
  })

  return ({ topic, durationMs, outcome }: IProcessedEvent) =>
    duration.observe({ topic, outcome }, durationMs / 1000)
}

export interface IUpstreamCall {
  upstream: string
  durationMs: number
  outcome: 'ok' | 'timeout' | 'error'
}

export function upstreamMetrics() {
  const duration = new Histogram({
    name: 'upstream_request_duration_seconds',
    help: 'Time until the upstream answered (headers) by upstream and outcome',
    labelNames: ['upstream', 'outcome'] as const,
    buckets: DURATION_BUCKETS,
  })

  return ({ upstream, durationMs, outcome }: IUpstreamCall) =>
    duration.observe({ upstream, outcome }, durationMs / 1000)
}

let defaultMetricsStarted = false

export interface IMetricsServerOptions {
  port: number
  service: string
}

export async function startMetricsServer({
  port,
  service,
}: IMetricsServerOptions) {
  register.setDefaultLabels({ service })

  if (!defaultMetricsStarted) {
    collectDefaultMetrics()
    defaultMetricsStarted = true
  }

  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end()

      return
    }

    try {
      const body = await register.metrics()

      res.writeHead(200, { 'content-type': register.contentType }).end(body)
    } catch {
      // An unhandled rejection here would kill the service being observed
      res.writeHead(500).end()
    }
  })

  await new Promise<void>((resolve) => server.listen(port, '0.0.0.0', resolve))

  const close = () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )

  return { port: (server.address() as AddressInfo).port, close }
}

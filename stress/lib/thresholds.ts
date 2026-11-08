export interface ILatencyLimit {
  p95: number
  p99: number
}

export const DEFAULT_LATENCY: ILatencyLimit = { p95: 500, p99: 1000 }
export const DEFAULT_ERROR_RATE = 0.01

export function thresholds(
  latencyMsByRoute: Record<string, ILatencyLimit>,
  errorRate = DEFAULT_ERROR_RATE,
) {
  const limits: Record<string, string[]> = {
    http_req_failed: [`rate<${errorRate}`],
    checks: [`rate>${1 - errorRate}`],
  }

  for (const [route, { p95, p99 }] of Object.entries(latencyMsByRoute)) {
    limits[`http_req_duration{name:${route}}`] = [
      `p(95)<${p95}`,
      `p(99)<${p99}`,
    ]
  }

  return limits
}

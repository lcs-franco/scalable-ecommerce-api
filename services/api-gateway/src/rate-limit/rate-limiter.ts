import type { Redis } from 'ioredis'
import { evaluateWindow, type IWindowDecision } from './sliding-window.js'

export interface IRateLimitResult extends IWindowDecision {
  limit: number
  resetMs: number
}

export interface IRateLimiter {
  hit(key: string, limit: number): Promise<IRateLimitResult>
}

// Denied requests also count, so a client that keeps hammering stays blocked.
const HIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local previous = redis.call('GET', KEYS[2])
return { current, tonumber(previous) or 0 }
`

export function createRateLimiter(
  redis: Redis,
  opts: { windowMs: number; now?: () => number },
): IRateLimiter {
  const { windowMs } = opts
  const now = opts.now ?? Date.now

  return {
    async hit(key, limit) {
      const timestamp = now()
      const window = Math.floor(timestamp / windowMs)
      const elapsedMs = timestamp - window * windowMs

      const [current, previous] = (await redis.eval(
        HIT_SCRIPT,
        2,
        `${key}:${window}`,
        `${key}:${window - 1}`,
        windowMs * 2,
      )) as [number, number]

      const decision = evaluateWindow({
        previous,
        current,
        elapsedMs,
        windowMs,
        limit,
      })
      return { ...decision, limit, resetMs: windowMs - elapsedMs }
    },
  }
}

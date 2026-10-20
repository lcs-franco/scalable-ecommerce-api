import type { Logger } from '@ecommerce/logger'
import type { RedisClient } from './redis.js'

interface IDeps {
  redis: RedisClient
  ttlSeconds: number
  log: Logger
}

export type Deduper = ReturnType<typeof createDeduper>

export function createDeduper(deps: IDeps) {
  const { redis, ttlSeconds, log } = deps

  // true = first delivery, process it; claimed before sending since deliver() never retries.
  async function claim(eventId?: string): Promise<boolean> {
    if (!eventId) {
      log.debug('Event without event-id header, processing without dedupe')
      return true
    }

    try {
      const result = await redis.set(
        `notification:event:${eventId}`,
        '1',
        'EX',
        ttlSeconds,
        'NX',
      )

      if (result === 'OK') return true

      log.info({ eventId }, 'Skipping duplicate event')
      return false
    } catch (err) {
      log.error({ err, eventId }, 'Dedupe check failed, processing anyway')
      return true
    }
  }

  return { claim }
}

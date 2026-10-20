import { Redis } from 'ioredis'

export type RedisClient = Redis

// Fail fast so a Redis outage falls open instead of waiting for a reconnect.
export function createRedis(url: string): RedisClient {
  return new Redis(url, { maxRetriesPerRequest: 1, commandTimeout: 500 })
}

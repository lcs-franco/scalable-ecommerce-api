import { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../index.js'

function captureLines() {
  const lines: string[] = []

  const destination = new Writable({
    write(chunk, _encoding, done) {
      lines.push(...String(chunk).split('\n').filter(Boolean))
      done()
    },
  })

  return { lines, destination }
}

describe('createLogger', () => {
  it('should write one JSON object per line by default', () => {
    const { lines, destination } = captureLines()

    const log = createLogger({ service: 'test-service' }, destination)

    log.info({ reqId: 'abc' }, 'hello')

    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: 'info',
      name: 'test-service',
      reqId: 'abc',
      msg: 'hello',
    })
  })

  it('should write human-readable lines in the pretty format', async () => {
    const { lines, destination } = captureLines()

    const log = createLogger(
      { service: 'test-service', format: 'pretty' },
      destination,
    )

    log.info('hello')

    await vi.waitFor(() => expect(lines).not.toHaveLength(0))

    expect(() => JSON.parse(lines[0]!)).toThrow()
    expect(lines[0]).toContain('hello')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  baseConfig,
  internalServiceToken,
  jwtSecret,
  loadConfig,
} from '../index.js'

const schema = baseConfig({ port: 3001 }).extend({
  JWT_SECRET: jwtSecret,
  INTERNAL_SERVICE_TOKEN: internalServiceToken,
  DATABASE_URL: z.string().url(),
})

const validEnv = {
  JWT_SECRET: 'x'.repeat(32),
  INTERNAL_SERVICE_TOKEN: 'y'.repeat(16),
  DATABASE_URL: 'postgresql://localhost:5432/user_db',
}

describe('baseConfig', () => {
  it('should default the shared variables', () => {
    expect(schema.parse(validEnv)).toMatchObject({
      PORT: 3001,
      METRICS_PORT: 9464,
      LOG_LEVEL: 'info',
    })
  })
})

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('should parse process.env', () => {
    for (const [name, value] of Object.entries(validEnv))
      vi.stubEnv(name, value)

    vi.stubEnv('PORT', '4000')

    expect(loadConfig(schema)).toMatchObject({ PORT: 4000, ...validEnv })
  })

  it('should print each invalid variable and exit 1', () => {
    vi.stubEnv('JWT_SECRET', 'short')
    vi.stubEnv('INTERNAL_SERVICE_TOKEN', validEnv.INTERNAL_SERVICE_TOKEN)
    vi.stubEnv('DATABASE_URL', '')

    const written: string[] = []

    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))

      return true
    })

    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })

    expect(() => loadConfig(schema)).toThrow('exit')
    expect(process.exit).toHaveBeenCalledWith(1)

    const output = written.join('')

    expect(output).toContain(
      'JWT_SECRET: JWT_SECRET must be at least 32 characters',
    )
    expect(output).toContain('DATABASE_URL:')
    expect(output).not.toContain('INTERNAL_SERVICE_TOKEN')
  })
})

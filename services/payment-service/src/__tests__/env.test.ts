import { describe, expect, it } from 'vitest'
import { parseEnv } from '../config/parse-env.js'

const BASE = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/payment_db',
  JWT_SECRET: 'test-secret-must-be-at-least-32-chars!',
}

describe('parseEnv', () => {
  it('defaults to the Stripe processor', () => {
    const config = parseEnv({ ...BASE, STRIPE_SECRET_KEY: 'sk_test_abc' })

    expect(config).toMatchObject({
      PAYMENT_PROCESSOR: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_abc',
    })
  })

  it.each([{}, { PAYMENT_PROCESSOR: 'stripe' }])(
    'requires a Stripe key for the Stripe processor (%o)',
    (processor) => {
      expect(() => parseEnv({ ...BASE, ...processor })).toThrow(
        /STRIPE_SECRET_KEY/,
      )
    },
  )

  it('accepts the fake processor without a Stripe key, with zeroed knobs', () => {
    const config = parseEnv({ ...BASE, PAYMENT_PROCESSOR: 'fake' })

    expect(config).toMatchObject({
      PAYMENT_PROCESSOR: 'fake',
      FAKE_PAYMENT_LATENCY_MS: 0,
      FAKE_PAYMENT_JITTER_MS: 0,
      FAKE_PAYMENT_FAILURE_RATE: 0,
    })
  })

  it('reads the fake processor knobs', () => {
    const config = parseEnv({
      ...BASE,
      PAYMENT_PROCESSOR: 'fake',
      FAKE_PAYMENT_LATENCY_MS: '3000',
      FAKE_PAYMENT_JITTER_MS: '500',
      FAKE_PAYMENT_FAILURE_RATE: '0.2',
    })

    expect(config).toMatchObject({
      FAKE_PAYMENT_LATENCY_MS: 3000,
      FAKE_PAYMENT_JITTER_MS: 500,
      FAKE_PAYMENT_FAILURE_RATE: 0.2,
    })
  })

  it.each([
    ['FAKE_PAYMENT_FAILURE_RATE', '1.5'],
    ['FAKE_PAYMENT_FAILURE_RATE', '-0.1'],
    ['FAKE_PAYMENT_LATENCY_MS', '-1'],
    ['FAKE_PAYMENT_JITTER_MS', '-1'],
  ])('rejects %s=%s', (name, value) => {
    expect(() =>
      parseEnv({ ...BASE, PAYMENT_PROCESSOR: 'fake', [name]: value }),
    ).toThrow(new RegExp(name))
  })
})

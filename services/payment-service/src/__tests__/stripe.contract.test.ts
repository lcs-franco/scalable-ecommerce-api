import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { createStripeProcessor } from '../payments/stripe.processor.js'

// Hits the real Stripe test API. Runs only when STRIPE_SECRET_KEY is exported
// in the shell (vitest does not load .env), so CI skips it.
const key = process.env.STRIPE_SECRET_KEY

describe.skipIf(!key)('stripe processor (contract, test mode)', () => {
  // Built per call: describe bodies run at collection even when skipped
  function createProcessor() {
    return createStripeProcessor({
      stripe: new Stripe(key!, { maxNetworkRetries: 2 }),
      log: { error: () => {} },
    })
  }

  function input(paymentMethod: string) {
    const orderId = randomUUID()
    return {
      amount: 1234,
      currency: 'usd',
      paymentMethod,
      idempotencyKey: `order-${orderId}` as const,
      metadata: { orderId },
    }
  }

  it('charges pm_card_visa successfully', async () => {
    const result = await createProcessor().processPayment(input('pm_card_visa'))

    expect(result.success).toBe(true)
    expect(result.providerPaymentId).toMatch(/^pi_/)
  })

  it('maps pm_card_chargeDeclined to a decline', async () => {
    const result = await createProcessor().processPayment(
      input('pm_card_chargeDeclined'),
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toMatch(/declined/i)
      expect(result.providerPaymentId).toMatch(/^pi_/)
    }
  })

  it('returns the same PaymentIntent for the same idempotency key', async () => {
    const processor = createProcessor()
    const sameInput = input('pm_card_visa')

    const first = await processor.processPayment(sameInput)
    const second = await processor.processPayment(sameInput)

    expect(first.success).toBe(true)
    expect(second.providerPaymentId).toBe(first.providerPaymentId)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeProcessor } from '../payments/fake.processor.js'

const ORDER_ID = '11111111-1111-1111-1111-111111111111'

function input(orderId = ORDER_ID, paymentMethod = 'pm_card_visa') {
  return {
    amount: 3000,
    currency: 'usd',
    paymentMethod,
    idempotencyKey: `order-${orderId}` as const,
    metadata: { orderId, userId: '00000000-0000-0000-0000-000000000002' },
  }
}

describe('createFakeProcessor', () => {
  it('declines every payment at failure rate 1', async () => {
    const processor = createFakeProcessor({ failureRate: 1 })

    await expect(processor.processPayment(input())).resolves.toEqual({
      success: false,
      reason: 'fake decline',
      providerPaymentId: `fake_${ORDER_ID}`,
    })
  })

  it('confirms every payment at failure rate 0', async () => {
    const processor = createFakeProcessor({ failureRate: 0 })

    await expect(processor.processPayment(input())).resolves.toEqual({
      success: true,
      providerPaymentId: `fake_${ORDER_ID}`,
    })
  })

  it('declines the Stripe test card pm_card_chargeDeclined at failure rate 0', async () => {
    const processor = createFakeProcessor({ failureRate: 0 })

    const result = await processor.processPayment(
      input(ORDER_ID, 'pm_card_chargeDeclined'),
    )

    expect(result.success).toBe(false)
  })

  it('replays the same outcome for a redelivered order', async () => {
    const processor = createFakeProcessor({ failureRate: 0.5 })
    const orderIds = Array.from({ length: 50 }, () => crypto.randomUUID())

    const outcomes = async () =>
      Promise.all(
        orderIds.map(async (orderId) => {
          const result = await processor.processPayment(input(orderId))

          return result.success
        }),
      )

    expect(await outcomes()).toEqual(await outcomes())
  })

  it('declines about the failure rate share of distinct orders', async () => {
    const processor = createFakeProcessor({ failureRate: 0.5 })

    const results = await Promise.all(
      Array.from({ length: 1000 }, () =>
        processor.processPayment(input(crypto.randomUUID())),
      ),
    )

    const declined = results.filter((result) => !result.success).length

    expect(declined).toBeGreaterThan(400)
    expect(declined).toBeLessThan(600)
  })

  describe('latency', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('answers only after the configured latency', async () => {
      vi.useFakeTimers()

      const processor = createFakeProcessor({ latencyMs: 3000 })
      let settled = false

      const pending = processor.processPayment(input()).then((result) => {
        settled = true

        return result
      })

      await vi.advanceTimersByTimeAsync(2999)

      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(1)

      expect(settled).toBe(true)
      await expect(pending).resolves.toMatchObject({ success: true })
    })
  })
})

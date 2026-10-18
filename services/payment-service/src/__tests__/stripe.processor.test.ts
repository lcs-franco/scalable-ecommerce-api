import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStripeProcessor } from '../payments/stripe.processor.js'

const INPUT = {
  amount: 3000,
  currency: 'usd',
  paymentMethod: 'pm_card_mastercard',
  idempotencyKey: 'order-11111111-1111-1111-1111-111111111111' as const,
  metadata: {
    orderId: '11111111-1111-1111-1111-111111111111',
    userId: '00000000-0000-0000-0000-000000000002',
  },
}

describe('createStripeProcessor', () => {
  const create = vi.fn()
  const log = { error: vi.fn(), warn: vi.fn() }
  const processor = createStripeProcessor({
    stripe: { paymentIntents: { create } } as unknown as Pick<
      Stripe,
      'paymentIntents'
    >,
    log,
  })

  beforeEach(() => {
    create.mockReset()
    log.error.mockReset()
    log.warn.mockReset()
  })

  it('is named stripe', () => {
    expect(processor.name).toBe('stripe')
  })

  it("creates a confirmed intent with the input's payment method, metadata and idempotency key", async () => {
    create.mockResolvedValue({ id: 'pi_ok', status: 'succeeded' })

    await processor.processPayment(INPUT)

    expect(create).toHaveBeenCalledWith(
      {
        amount: 3000,
        currency: 'usd',
        confirm: true,
        payment_method: 'pm_card_mastercard',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: INPUT.metadata,
      },
      { idempotencyKey: INPUT.idempotencyKey },
    )
  })

  it('maps a succeeded intent to success', async () => {
    create.mockResolvedValue({ id: 'pi_ok', status: 'succeeded' })

    await expect(processor.processPayment(INPUT)).resolves.toEqual({
      success: true,
      providerPaymentId: 'pi_ok',
    })
  })

  it('maps any other intent status to failure with the intent id', async () => {
    create.mockResolvedValue({ id: 'pi_3ds', status: 'requires_action' })

    await expect(processor.processPayment(INPUT)).resolves.toEqual({
      success: false,
      reason: 'unexpected status: requires_action',
      providerPaymentId: 'pi_3ds',
    })
  })

  it('maps a StripeCardError to failure with its message and intent id', async () => {
    create.mockRejectedValue(
      new Stripe.errors.StripeCardError({
        type: 'card_error',
        message: 'Your card was declined.',
        payment_intent: { id: 'pi_declined' } as Stripe.PaymentIntent,
      }),
    )

    await expect(processor.processPayment(INPUT)).resolves.toEqual({
      success: false,
      reason: 'Your card was declined.',
      providerPaymentId: 'pi_declined',
    })
  })

  it('maps a StripeCardError without an intent to failure without an id', async () => {
    create.mockRejectedValue(
      new Stripe.errors.StripeCardError({
        type: 'card_error',
        message: 'Your card was declined.',
      }),
    )

    const result = await processor.processPayment(INPUT)

    expect(result).toEqual({
      success: false,
      reason: 'Your card was declined.',
    })
  })

  it('maps an invalid payment method to failure and logs a warning', async () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      code: 'resource_missing',
      param: 'payment_method',
      message: "No such PaymentMethod: 'pm_nope'",
    })
    create.mockRejectedValue(err)

    await expect(processor.processPayment(INPUT)).resolves.toEqual({
      success: false,
      reason: 'invalid payment method',
    })
    expect(log.warn).toHaveBeenCalledOnce()
    expect(log.warn.mock.calls[0]).toContain(err)
    expect(log.error).not.toHaveBeenCalled()
  })

  it('maps an invalid request on another param to a generic failure', async () => {
    create.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        param: 'currency',
        message: 'Invalid currency',
      }),
    )

    await expect(processor.processPayment(INPUT)).resolves.toEqual({
      success: false,
      reason: 'payment provider error',
    })
    expect(log.error).toHaveBeenCalledOnce()
  })

  it('maps any other error to a generic failure and logs the details', async () => {
    const err = new Stripe.errors.StripeConnectionError({
      type: 'api_error',
      message: 'socket hang up',
    })
    create.mockRejectedValue(err)

    await expect(processor.processPayment(INPUT)).resolves.toEqual({
      success: false,
      reason: 'payment provider error',
    })
    expect(log.error).toHaveBeenCalledOnce()
    expect(log.error.mock.calls[0]).toContain(err)
  })
})

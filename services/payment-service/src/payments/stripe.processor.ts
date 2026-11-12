import type { Logger } from '@ecommerce/logger'
import Stripe from 'stripe'
import type {
  IPaymentProcessor,
  IProcessPaymentInput,
  PaymentResult,
} from './payment-processor.js'

interface IStripeProcessorOptions {
  stripe: Pick<Stripe, 'paymentIntents'>
  log: Pick<Logger, 'error' | 'warn'>
}

export function createStripeProcessor(
  opts: IStripeProcessorOptions,
): IPaymentProcessor {
  const { stripe, log } = opts

  function createIntent(input: IProcessPaymentInput) {
    return stripe.paymentIntents.create(
      {
        amount: input.amount,
        currency: input.currency,
        confirm: true,
        payment_method: input.paymentMethod,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: input.metadata,
      },
      { idempotencyKey: input.idempotencyKey },
    )
  }

  async function cancelIntent(id: string) {
    try {
      await stripe.paymentIntents.cancel(id)
    } catch (err) {
      log.warn(
        { err, paymentIntentId: id },
        'stripe payment intent cancel failed',
      )
    }
  }

  async function processPayment(
    input: IProcessPaymentInput,
  ): Promise<PaymentResult> {
    try {
      const intent = await createIntent(input)

      if (intent.status === 'succeeded') {
        return { success: true, providerPaymentId: intent.id }
      }

      // Payment runs from order.placed, so the shopper is gone and cannot complete 3DS.
      if (intent.status === 'requires_action') {
        await cancelIntent(intent.id)

        return {
          success: false,
          reason: 'authentication required',
          providerPaymentId: intent.id,
        }
      }

      return {
        success: false,
        reason: `unexpected status: ${intent.status}`,
        providerPaymentId: intent.id,
      }
    } catch (err) {
      if (err instanceof Stripe.errors.StripeCardError) {
        return {
          success: false,
          reason: err.message,
          providerPaymentId: err.payment_intent?.id,
        }
      }

      if (
        err instanceof Stripe.errors.StripeInvalidRequestError &&
        err.param === 'payment_method'
      ) {
        log.warn(err, 'invalid payment method')

        return { success: false, reason: 'invalid payment method' }
      }

      log.error(err, 'stripe payment failed')

      return { success: false, reason: 'payment provider error' }
    }
  }

  return { name: 'stripe', processPayment }
}

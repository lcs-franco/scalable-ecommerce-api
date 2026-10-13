import type { Logger } from '@ecommerce/logger'
import Stripe from 'stripe'
import type {
  IPaymentProcessor,
  IProcessPaymentInput,
  PaymentResult,
} from './payment-processor.js'

interface IStripeProcessorOptions {
  stripe: Pick<Stripe, 'paymentIntents'>
  paymentMethod: string
  log: Pick<Logger, 'error'>
}

export function createStripeProcessor(
  opts: IStripeProcessorOptions,
): IPaymentProcessor {
  const { stripe, paymentMethod, log } = opts

  function createIntent(input: IProcessPaymentInput) {
    return stripe.paymentIntents.create(
      {
        amount: input.amount,
        currency: input.currency,
        confirm: true,
        payment_method: paymentMethod,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: input.metadata,
      },
      { idempotencyKey: input.idempotencyKey },
    )
  }

  async function processPayment(
    input: IProcessPaymentInput,
  ): Promise<PaymentResult> {
    try {
      const intent = await createIntent(input)

      if (intent.status === 'succeeded') {
        return { success: true, providerPaymentId: intent.id }
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

      log.error(err, 'stripe payment failed')
      return { success: false, reason: 'payment provider error' }
    }
  }

  return { name: 'stripe', processPayment }
}

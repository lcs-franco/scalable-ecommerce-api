import { createHash } from 'node:crypto'
import type {
  IPaymentProcessor,
  IProcessPaymentInput,
  PaymentResult,
} from './payment-processor.js'

const DECLINED_TEST_CARD = 'pm_card_chargeDeclined'

interface IFakeProcessorOptions {
  latencyMs?: number
  jitterMs?: number
  failureRate?: number
}

// Same key, same outcome, as Stripe replays a redelivered request
function isDeclined(idempotencyKey: string, failureRate: number) {
  const digest = createHash('sha256').update(idempotencyKey).digest()

  return digest.readUInt32BE(0) / 2 ** 32 < failureRate
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createFakeProcessor(
  opts: IFakeProcessorOptions = {},
): IPaymentProcessor {
  const { latencyMs = 0, jitterMs = 0, failureRate = 0 } = opts

  async function processPayment(
    input: IProcessPaymentInput,
  ): Promise<PaymentResult> {
    await sleep(latencyMs + Math.random() * jitterMs)

    const providerPaymentId = `fake_${input.metadata.orderId}`

    if (
      input.paymentMethod === DECLINED_TEST_CARD ||
      isDeclined(input.idempotencyKey, failureRate)
    ) {
      return { success: false, reason: 'fake decline', providerPaymentId }
    }

    return { success: true, providerPaymentId }
  }

  return { name: 'fake', processPayment }
}

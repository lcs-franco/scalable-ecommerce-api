export type ProviderName = 'stripe'

export interface IProcessPaymentInput {
  amount: number // cents
  currency: string
  idempotencyKey: `order-${string}`
  metadata: Record<string, string>
}

export type PaymentResult =
  | { success: true; providerPaymentId: string }
  | { success: false; reason: string; providerPaymentId?: string }

export interface IPaymentProcessor {
  readonly name: ProviderName
  processPayment(input: IProcessPaymentInput): Promise<PaymentResult>
}

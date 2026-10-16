import { type createProducer, Topics } from '@ecommerce/events'
import type { IPaymentPublishers } from '../services/payment.service.js'

export function createPublishers(
  producer: ReturnType<typeof createProducer>,
): IPaymentPublishers {
  return {
    publishPaymentConfirmed: (data) =>
      producer.publish(Topics.PAYMENT_CONFIRMED, data),
    publishPaymentFailed: (data) =>
      producer.publish(Topics.PAYMENT_FAILED, data),
  }
}

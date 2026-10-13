import { type createConsumer, Topics } from '@ecommerce/events'
import type { Logger } from '@ecommerce/logger'
import type { PaymentService } from '../services/payment.service.js'

interface IDeps {
  consumer: ReturnType<typeof createConsumer>
  paymentService: PaymentService
  log: Logger
}

export async function setupConsumers(deps: IDeps) {
  const { consumer, paymentService, log } = deps

  await consumer.subscribe(Topics.ORDER_PLACED, async (data) => {
    log.info({ orderId: data.orderId }, 'Order placed — processing payment')
    await paymentService.processOrderPlaced(data)
  })

  await consumer.start()
}

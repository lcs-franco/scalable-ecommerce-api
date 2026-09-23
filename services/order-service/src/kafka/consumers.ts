import { type createConsumer, Topics } from '@ecommerce/events'
import type { FastifyBaseLogger } from 'fastify'
import type { createProductClient } from '../clients/product.client.js'
import type { createOrderService } from '../services/order.service.js'

interface IDeps {
  consumer: ReturnType<typeof createConsumer>
  orderService: ReturnType<typeof createOrderService>
  productClient: ReturnType<typeof createProductClient>
  log: FastifyBaseLogger
}

export async function setupConsumers(deps: IDeps) {
  const { consumer, orderService, productClient, log } = deps

  await consumer.subscribe(Topics.PAYMENT_CONFIRMED, async (data) => {
    log.info({ orderId: data.orderId }, 'Payment confirmed — marking as paid')
    await orderService.markAsPaid(data.orderId)
  })

  await consumer.subscribe(Topics.PAYMENT_FAILED, async (data) => {
    log.info({ orderId: data.orderId }, 'Payment failed — cancelling order')
    const items = await orderService.markAsCancelled(data.orderId)
    if (items) {
      await productClient.restoreStock(items)
    }
  })
}

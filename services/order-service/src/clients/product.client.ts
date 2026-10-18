import { ErrorCode, InsufficientStock } from '../errors/index.js'
import { readUpstreamError } from './upstream.js'

interface IOrderItem {
  productId: string
  quantity: number
}

export interface IValidatedItem {
  productId: string
  name: string
  price: number
  quantity: number
}

interface IProductClientOptions {
  baseUrl: string
  internalServiceToken: string
}

export function createProductClient(opts: IProductClientOptions) {
  async function validateOrder(items: IOrderItem[]): Promise<IValidatedItem[]> {
    const res = await fetch(`${opts.baseUrl}/products/validate-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': opts.internalServiceToken,
      },
      body: JSON.stringify({ items }),
    })
    if (!res.ok) {
      const upstream = await readUpstreamError(res)
      if (upstream.code === ErrorCode.INSUFFICIENT_STOCK) {
        throw new InsufficientStock(upstream.message)
      }
      throw new Error(
        `Product validation failed: ${upstream.status} ${upstream.text}`,
      )
    }
    const body = (await res.json()) as { items: IValidatedItem[] }
    return body.items
  }

  async function restoreStock(items: IOrderItem[]): Promise<void> {
    try {
      await fetch(`${opts.baseUrl}/products/restore-stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': opts.internalServiceToken,
        },
        body: JSON.stringify({ items }),
      })
    } catch {
      // Best-effort compensation
    }
  }

  async function restoreOrderStock(
    orderId: string,
    items: IOrderItem[],
  ): Promise<void> {
    const res = await fetch(
      `${opts.baseUrl}/products/orders/${orderId}/restore-stock`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': opts.internalServiceToken,
        },
        body: JSON.stringify({ items }),
      },
    )
    if (!res.ok) {
      throw new Error(`Stock restore failed: ${res.status} ${await res.text()}`)
    }
  }

  return { validateOrder, restoreStock, restoreOrderStock }
}

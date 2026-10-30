import { requestIdHeaders } from '@ecommerce/http'
import { CartEmpty, ErrorCode } from '../errors/index.js'
import { readUpstreamError } from './upstream.js'

interface ICartItem {
  productId: string
  quantity: number
}

interface ICartClientOptions {
  baseUrl: string
  internalServiceToken: string
}

export function createCartClient(opts: ICartClientOptions) {
  async function checkout(
    userId: string,
    requestId?: string,
  ): Promise<ICartItem[]> {
    const res = await fetch(`${opts.baseUrl}/cart/checkout`, {
      method: 'POST',
      headers: {
        'x-internal-token': opts.internalServiceToken,
        'x-user-id': userId,
        ...requestIdHeaders(requestId),
      },
    })
    if (!res.ok) {
      const upstream = await readUpstreamError(res)
      if (upstream.code === ErrorCode.CART_EMPTY) {
        throw new CartEmpty()
      }
      throw new Error(
        `Cart checkout failed: ${upstream.status} ${upstream.text}`,
      )
    }
    const body = (await res.json()) as { items: ICartItem[] }
    return body.items
  }

  async function restore(
    items: ICartItem[],
    userToken: string,
    requestId?: string,
  ): Promise<void> {
    for (const item of items) {
      try {
        await fetch(`${opts.baseUrl}/cart/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userToken}`,
            ...requestIdHeaders(requestId),
          },
          body: JSON.stringify({
            productId: item.productId,
            quantity: item.quantity,
          }),
        })
      } catch {
        // Best-effort compensation
      }
    }
  }

  return { checkout, restore }
}

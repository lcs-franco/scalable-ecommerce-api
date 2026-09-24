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
  async function validateOrder(
    items: IOrderItem[],
    token: string,
  ): Promise<IValidatedItem[]> {
    const res = await fetch(`${opts.baseUrl}/products/validate-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ items }),
    })
    if (!res.ok) {
      throw new Error(
        `Product validation failed: ${res.status} ${await res.text()}`,
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

  return { validateOrder, restoreStock }
}

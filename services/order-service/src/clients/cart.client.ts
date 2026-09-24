interface ICartItem {
  productId: string
  quantity: number
}

interface ICartClientOptions {
  baseUrl: string
  internalServiceToken: string
}

export function createCartClient(opts: ICartClientOptions) {
  async function checkout(userId: string): Promise<ICartItem[]> {
    const res = await fetch(`${opts.baseUrl}/cart/checkout`, {
      method: 'POST',
      headers: {
        'x-internal-token': opts.internalServiceToken,
        'x-user-id': userId,
      },
    })
    if (!res.ok) {
      throw new Error(`Cart checkout failed: ${res.status} ${await res.text()}`)
    }
    const body = (await res.json()) as { items: ICartItem[] }
    return body.items
  }

  async function restore(items: ICartItem[], userToken: string): Promise<void> {
    for (const item of items) {
      try {
        await fetch(`${opts.baseUrl}/cart/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userToken}`,
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

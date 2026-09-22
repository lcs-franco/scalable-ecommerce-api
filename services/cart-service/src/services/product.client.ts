export interface IProductInfo {
  id: string
  name: string
  price: number
}

export function createProductClient(baseUrl: string) {
  async function fetchProducts(
    productIds: string[],
  ): Promise<Map<string, IProductInfo>> {
    const results = new Map<string, IProductInfo>()

    const fetches = productIds.map(async (id) => {
      try {
        const res = await fetch(`${baseUrl}/products/${id}`)
        if (res.ok) {
          const data = (await res.json()) as IProductInfo
          results.set(id, data)
        }
      } catch {
        // Product unavailable — will be flagged in response
      }
    })

    await Promise.all(fetches)
    return results
  }

  return { fetchProducts }
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatCents(cents: number) {
  return usd.format(cents / 100)
}

// Order ids are long; customers recognise the first block.
export function shortId(orderId: string) {
  return orderId.slice(0, 8)
}

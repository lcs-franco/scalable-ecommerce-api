import { check } from 'k6'
import type { Options } from 'k6/options'
import { type ISession, loginUsers, vuSession } from '../lib/auth.ts'
import { send } from '../lib/http.ts'
import { SUMMARY_TREND_STATS, summary } from '../lib/summary.ts'
import { DEFAULT_LATENCY, thresholds } from '../lib/thresholds.ts'
import { pickProduct, uuid } from '../lib/world.ts'

// Low rate: checkout charges Stripe test mode
export const options: Options = {
  scenarios: {
    smoke: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 5,
      maxVUs: 20,
    },
  },
  setupTimeout: '2m',
  summaryTrendStats: SUMMARY_TREND_STATS,
  thresholds: thresholds({
    '/api/products': DEFAULT_LATENCY,
    '/api/products/:id': DEFAULT_LATENCY,
    '/api/cart/items': DEFAULT_LATENCY,
    '/api/orders': { p95: 1000, p99: 2000 },
  }),
}

export function setup() {
  return loginUsers()
}

export default function (sessions: ISession[]) {
  const { token } = vuSession(sessions)
  const productId = uuid('product', pickProduct())

  const page = send({
    method: 'GET',
    route: '/api/products',
    query: { limit: 20 },
  })

  check(page, { 'products listed': (r) => r.status === 200 })

  const detail = send({
    method: 'GET',
    route: '/api/products/:id',
    params: { id: productId },
  })

  check(detail, { 'product found': (r) => r.status === 200 })

  const added = send({
    method: 'POST',
    route: '/api/cart/items',
    body: { productId, quantity: 1 },
    token,
  })

  check(added, { 'item added': (r) => r.status === 201 })

  const order = send({
    method: 'POST',
    route: '/api/orders',
    body: { paymentMethodId: 'pm_card_visa' },
    token,
  })

  const placed = check(order, { 'order placed': (r) => r.status === 201 })

  // A leftover item would fail every later checkout of this user
  if (!placed) send({ method: 'DELETE', route: '/api/cart', token })
}

export const handleSummary = summary('smoke')

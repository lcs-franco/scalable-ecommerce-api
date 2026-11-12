import http from 'k6/http'

const TOXIPROXY_URL = __ENV.TOXIPROXY_URL || 'http://toxiproxy:8474'

// Proxies declared in toxiproxy.json
export type ProxyName =
  | 'order-product'
  | 'order-cart'
  | 'user-postgres'
  | 'product-postgres'
  | 'order-postgres'
  | 'payment-postgres'
  | 'kafka'

// https://github.com/Shopify/toxiproxy#toxics
export interface IToxic {
  name: string
  type:
    | 'latency'
    | 'bandwidth'
    | 'slow_close'
    | 'timeout'
    | 'reset_peer'
    | 'slicer'
    | 'limit_data'
  attributes: Record<string, number>
  stream?: 'upstream' | 'downstream'
  toxicity?: number
}

// Toxiproxy calls carry their own `name` tag, so they never mix with a route's latency series
function callToxiproxy(method: string, path: string, body?: unknown) {
  const response = http.request(
    method,
    `${TOXIPROXY_URL}${path}`,
    body === undefined ? null : JSON.stringify(body),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'toxiproxy' },
    },
  )

  if (response.status >= 300) {
    throw new Error(
      `toxiproxy ${method} ${path}: ${response.status} ${String(response.body)}`,
    )
  }
}

export function addToxic(proxy: ProxyName, toxic: IToxic) {
  callToxiproxy('POST', `/proxies/${proxy}/toxics`, toxic)
}

export function removeToxic(proxy: ProxyName, toxicName: string) {
  callToxiproxy('DELETE', `/proxies/${proxy}/toxics/${toxicName}`)
}

// A disabled proxy closes its connections and refuses new ones: the dependency is down
export function setProxyEnabled(proxy: ProxyName, enabled: boolean) {
  callToxiproxy('POST', `/proxies/${proxy}`, { enabled })
}

export function clearFaults() {
  callToxiproxy('POST', '/reset')
}

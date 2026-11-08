import http, { type ObjectBatchRequest } from 'k6/http'

const BASE_URL = __ENV.BASE_URL || 'http://api-gateway:3000'

export interface IApiRequest {
  method: 'GET' | 'POST' | 'DELETE'
  route: string
  params?: Record<string, string>
  query?: Record<string, string | number>
  body?: unknown
  token?: string
}

function pathOf({ route, params = {} }: IApiRequest) {
  return route.replace(/:(\w+)/g, (_, name: string) => {
    if (params[name] === undefined) {
      throw new Error(`${route} needs :${name}`)
    }

    return encodeURIComponent(params[name])
  })
}

function queryOf({ query }: IApiRequest) {
  if (!query) return ''

  const pairs = Object.entries(query).map(
    ([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
  )

  return `?${pairs.join('&')}`
}

// Tagging `name` with the route template keeps one series per route, as metricsPlugin does
function toRequest(request: IApiRequest): ObjectBatchRequest {
  const headers: Record<string, string> = {}

  if (request.body !== undefined) headers['Content-Type'] = 'application/json'

  if (request.token) headers.Authorization = `Bearer ${request.token}`

  return {
    method: request.method,
    url: `${BASE_URL}${pathOf(request)}${queryOf(request)}`,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
    params: { headers, tags: { name: request.route } },
  }
}

export function send(request: IApiRequest) {
  const { method, url, body, params } = toRequest(request)

  return http.request(method, url, body, params)
}

export function sendBatch(requests: IApiRequest[]) {
  return http.batch(requests.map(toRequest))
}

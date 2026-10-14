import type { HTTPMethods } from 'fastify'

export type Access = 'public' | 'user' | 'admin'
export type UpstreamName = 'user' | 'product' | 'cart' | 'order' | 'payment'
export type Upstreams = Record<UpstreamName, string>

export interface IGatewayRoute {
  method: HTTPMethods
  path: string
  access: Access
  upstream: UpstreamName
}

export const STRIPPED_PREFIX: Record<UpstreamName, string> = {
  user: '/api/auth',
  product: '/api',
  cart: '/api',
  order: '/api',
  payment: '/api',
}

// Internal routes (validate-order, restore-stock, cart checkout) must never be listed.
export const ROUTES: IGatewayRoute[] = [
  {
    method: 'POST',
    path: '/api/auth/register',
    access: 'public',
    upstream: 'user',
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    access: 'public',
    upstream: 'user',
  },
  {
    method: 'POST',
    path: '/api/auth/refresh',
    access: 'public',
    upstream: 'user',
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    access: 'user',
    upstream: 'user',
  },
  {
    method: 'GET',
    path: '/api/auth/profile',
    access: 'user',
    upstream: 'user',
  },
  {
    method: 'PATCH',
    path: '/api/auth/profile',
    access: 'user',
    upstream: 'user',
  },

  {
    method: 'GET',
    path: '/api/products',
    access: 'public',
    upstream: 'product',
  },
  {
    method: 'GET',
    path: '/api/products/:id',
    access: 'public',
    upstream: 'product',
  },
  {
    method: 'POST',
    path: '/api/products',
    access: 'admin',
    upstream: 'product',
  },
  {
    method: 'PATCH',
    path: '/api/products/:id',
    access: 'admin',
    upstream: 'product',
  },
  {
    method: 'DELETE',
    path: '/api/products/:id',
    access: 'admin',
    upstream: 'product',
  },
  {
    method: 'GET',
    path: '/api/categories',
    access: 'public',
    upstream: 'product',
  },
  {
    method: 'POST',
    path: '/api/categories',
    access: 'admin',
    upstream: 'product',
  },
  {
    method: 'PATCH',
    path: '/api/categories/:id',
    access: 'admin',
    upstream: 'product',
  },
  {
    method: 'DELETE',
    path: '/api/categories/:id',
    access: 'admin',
    upstream: 'product',
  },

  { method: 'GET', path: '/api/cart', access: 'user', upstream: 'cart' },
  { method: 'DELETE', path: '/api/cart', access: 'user', upstream: 'cart' },
  { method: 'POST', path: '/api/cart/items', access: 'user', upstream: 'cart' },
  {
    method: 'PATCH',
    path: '/api/cart/items/:productId',
    access: 'user',
    upstream: 'cart',
  },
  {
    method: 'DELETE',
    path: '/api/cart/items/:productId',
    access: 'user',
    upstream: 'cart',
  },

  { method: 'POST', path: '/api/orders', access: 'user', upstream: 'order' },
  { method: 'GET', path: '/api/orders', access: 'user', upstream: 'order' },
  { method: 'GET', path: '/api/orders/:id', access: 'user', upstream: 'order' },
  {
    method: 'PATCH',
    path: '/api/orders/:id/status',
    access: 'admin',
    upstream: 'order',
  },

  {
    method: 'GET',
    path: '/api/payments/order/:orderId',
    access: 'user',
    upstream: 'payment',
  },
]

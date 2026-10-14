import { describe, expect, it } from 'vitest'
import {
  orderConfirmationEmail,
  orderStatusEmail,
  paymentFailedEmail,
  welcomeEmail,
} from '../emails/index.js'
import { formatCents } from '../emails/format.js'
import { EMAIL, ORDER_ID, PAYMENT_ID, PRODUCT_ID, USER_ID } from './helpers.js'

describe('formatCents', () => {
  it('formats cents as USD', () => {
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(5)).toBe('$0.05')
  })
})

describe('emails', () => {
  it('welcome email escapes the user name', async () => {
    const { html } = await welcomeEmail({
      userId: USER_ID,
      email: EMAIL,
      name: '<script>x</script>',
    })

    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('order confirmation lists items with subtotals and the total', async () => {
    const { subject, html } = await orderConfirmationEmail({
      orderId: ORDER_ID,
      userId: USER_ID,
      email: EMAIL,
      items: [
        { productId: PRODUCT_ID, name: 'Keyboard', quantity: 2, price: 4999 },
      ],
      total: 9998,
    })

    expect(subject).toBe(`Order ${ORDER_ID.slice(0, 8)} confirmed`)
    expect(html).toContain('Keyboard')
    expect(html).toContain('$99.98')
  })

  it('payment failure includes the reason', async () => {
    const { html } = await paymentFailedEmail({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      userId: USER_ID,
      email: EMAIL,
      reason: 'Your card was declined.',
    })

    expect(html).toContain('Your card was declined.')
  })

  it('inlines Tailwind classes as styles', async () => {
    const { html } = await orderStatusEmail({
      orderId: ORDER_ID,
      userId: USER_ID,
      email: EMAIL,
      status: 'shipped',
    })

    expect(html).not.toContain('class="')
    expect(html).toContain('style="')
  })
})

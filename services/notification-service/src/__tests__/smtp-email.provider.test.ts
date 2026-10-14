import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSmtpEmailProvider } from '../providers/smtp-email.provider.js'
import { EMAIL, fakeLogger } from './helpers.js'

const transport = vi.hoisted(() => ({
  verify: vi.fn(),
  sendMail: vi.fn(),
}))

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => transport) },
}))

const FROM = '"E-commerce" <no-reply@ecommerce.local>'

describe('SmtpEmailProvider', () => {
  beforeEach(() => {
    transport.verify.mockReset().mockResolvedValue(true)
    transport.sendMail.mockReset().mockResolvedValue({ messageId: 'abc' })
  })

  it('fails startup when the SMTP server is unreachable', async () => {
    transport.verify.mockRejectedValue(new Error('connect ECONNREFUSED'))

    await expect(
      createSmtpEmailProvider({
        host: 'localhost',
        port: 1025,
        from: FROM,
        log: fakeLogger(),
      }),
    ).rejects.toThrow('ECONNREFUSED')
  })

  it('sends from the configured sender', async () => {
    const email = await createSmtpEmailProvider({
      host: 'localhost',
      port: 1025,
      from: FROM,
      log: fakeLogger(),
    })

    await email.send({ to: EMAIL, subject: 'Hi', html: '<p>Hi</p>' })

    expect(transport.sendMail).toHaveBeenCalledWith({
      from: FROM,
      to: EMAIL,
      subject: 'Hi',
      html: '<p>Hi</p>',
    })
  })
})

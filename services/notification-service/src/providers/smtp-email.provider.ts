import type { Logger } from '@ecommerce/logger'
import nodemailer from 'nodemailer'
import type { IEmailProvider } from './email-provider.js'

interface IDeps {
  host: string
  port: number
  from: string
  log: Logger
}

// Any SMTP server: Mailpit in dev (docker compose), a real relay later.
// verify() throws when the server is unreachable, so startup fails fast.
export async function createSmtpEmailProvider(
  deps: IDeps,
): Promise<IEmailProvider> {
  const { host, port, from, log } = deps
  const transport = nodemailer.createTransport({ host, port })

  await transport.verify()
  log.info(`SMTP ready at ${host}:${port}`)

  return {
    async send({ to, subject, html }) {
      const info = await transport.sendMail({ from, to, subject, html })
      log.info({ subject, messageId: info.messageId }, 'Email sent')
    },
  }
}

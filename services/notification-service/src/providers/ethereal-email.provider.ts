import type { Logger } from '@ecommerce/logger'
import nodemailer from 'nodemailer'
import type { IEmailProvider } from './email-provider.js'

interface IDeps {
  from: string
  log: Logger
}

// Async because the SMTP credentials only exist after createTestAccount().
// Throws when Ethereal is unreachable, so startup fails fast.
export async function createEtherealEmailProvider(
  deps: IDeps,
): Promise<IEmailProvider> {
  const { from, log } = deps
  const account = await nodemailer.createTestAccount()

  const transport = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
  })

  log.info(
    { user: account.user, pass: account.pass },
    `Ethereal inbox: ${account.web} (log in with the user/pass above)`,
  )

  return {
    async send({ to, subject, html }) {
      const info = await transport.sendMail({ from, to, subject, html })
      log.info(
        { to, subject, preview: nodemailer.getTestMessageUrl(info) },
        'Email sent',
      )
    },
  }
}

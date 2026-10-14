export interface IEmailMessage {
  to: string
  subject: string
  html: string
}

// Strategy port: SMTP (Mailpit) in MVP, a provider API (Resend, SendGrid) later.
export interface IEmailProvider {
  send(message: IEmailMessage): Promise<void>
}

export interface IEmailMessage {
  to: string
  subject: string
  html: string
}

// Strategy port: Ethereal in MVP, a real provider (Resend, SendGrid) later.
export interface IEmailProvider {
  send(message: IEmailMessage): Promise<void>
}

// Strategy port: console in MVP, Twilio later. Not wired to any event yet:
// no phone number exists in the system.
export interface ISmsProvider {
  send(phone: string, message: string): Promise<void>
}

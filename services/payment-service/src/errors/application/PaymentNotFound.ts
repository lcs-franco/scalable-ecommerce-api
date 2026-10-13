import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class PaymentNotFound extends ApplicationError {
  public override statusCode = 404
  public override code = ErrorCode.PAYMENT_NOT_FOUND

  constructor() {
    super('Payment not found')
    this.name = 'PaymentNotFound'
  }
}

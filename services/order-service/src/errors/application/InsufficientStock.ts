import { ApplicationError } from '@ecommerce/http'
import { ErrorCode } from '../ErrorCode.js'

export class InsufficientStock extends ApplicationError {
  public override statusCode = 409
  public override code = ErrorCode.INSUFFICIENT_STOCK

  constructor(message = 'Insufficient stock') {
    super(message)
    this.name = 'InsufficientStock'
  }
}

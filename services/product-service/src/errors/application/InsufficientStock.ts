import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class InsufficientStock extends ApplicationError {
  public override statusCode = 409
  public override code = ErrorCode.INSUFFICIENT_STOCK

  constructor(productId: string) {
    super(`Insufficient stock for product ${productId}`)
    this.name = 'InsufficientStock'
  }
}

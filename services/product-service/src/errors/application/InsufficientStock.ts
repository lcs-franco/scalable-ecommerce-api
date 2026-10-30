import { ApplicationError } from '@ecommerce/http'
import { ErrorCode } from '../ErrorCode.js'

export class InsufficientStock extends ApplicationError {
  public override statusCode = 409
  public override code = ErrorCode.INSUFFICIENT_STOCK

  constructor(productId: string) {
    super(`Insufficient stock for product ${productId}`)
    this.name = 'InsufficientStock'
  }
}

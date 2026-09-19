import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class ProductNotFound extends ApplicationError {
  public override statusCode = 404
  public override code = ErrorCode.PRODUCT_NOT_FOUND

  constructor() {
    super('Product not found')
    this.name = 'ProductNotFound'
  }
}

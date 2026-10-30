import { ApplicationError } from '@ecommerce/http'
import { ErrorCode } from '../ErrorCode.js'

export class ProductNotFound extends ApplicationError {
  public override statusCode = 404
  public override code = ErrorCode.PRODUCT_NOT_FOUND

  constructor() {
    super('Product not found')
    this.name = 'ProductNotFound'
  }
}

import { ApplicationError } from '@ecommerce/http'
import { ErrorCode } from '../ErrorCode.js'

export class CartEmpty extends ApplicationError {
  public override statusCode = 400
  public override code = ErrorCode.CART_EMPTY

  constructor() {
    super('Cart is empty')
    this.name = 'CartEmpty'
  }
}

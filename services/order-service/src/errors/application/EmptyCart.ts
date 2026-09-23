import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class EmptyCart extends ApplicationError {
  public override statusCode = 400
  public override code = ErrorCode.EMPTY_CART

  constructor() {
    super('Cart is empty')
    this.name = 'EmptyCart'
  }
}

import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class ItemNotInCart extends ApplicationError {
  public override statusCode = 404
  public override code = ErrorCode.ITEM_NOT_IN_CART

  constructor() {
    super('Item not found in cart')
    this.name = 'ItemNotInCart'
  }
}

import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class OrderNotFound extends ApplicationError {
  public override statusCode = 404
  public override code = ErrorCode.ORDER_NOT_FOUND

  constructor() {
    super('Order not found')
    this.name = 'OrderNotFound'
  }
}

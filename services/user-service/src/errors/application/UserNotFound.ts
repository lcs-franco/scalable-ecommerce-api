import { ApplicationError } from '@ecommerce/http'
import { ErrorCode } from '../ErrorCode.js'

export class UserNotFound extends ApplicationError {
  public override statusCode = 404
  public override code = ErrorCode.USER_NOT_FOUND

  constructor() {
    super('User not found')
    this.name = 'UserNotFound'
  }
}

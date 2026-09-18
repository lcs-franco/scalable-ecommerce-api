import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class InvalidRefreshToken extends ApplicationError {
  public override statusCode = 401
  public override code = ErrorCode.INVALID_REFRESH_TOKEN

  constructor() {
    super('Invalid or expired refresh token')
    this.name = 'InvalidRefreshToken'
  }
}

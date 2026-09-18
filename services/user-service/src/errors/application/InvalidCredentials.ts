import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class InvalidCredentials extends ApplicationError {
  public override statusCode = 401
  public override code = ErrorCode.INVALID_CREDENTIALS

  constructor() {
    super('Invalid credentials')
    this.name = 'InvalidCredentials'
  }
}

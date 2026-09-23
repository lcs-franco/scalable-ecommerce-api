import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class Unauthorized extends ApplicationError {
  public override statusCode = 401
  public override code = ErrorCode.UNAUTHORIZED

  constructor() {
    super('Invalid service token')
    this.name = 'Unauthorized'
  }
}

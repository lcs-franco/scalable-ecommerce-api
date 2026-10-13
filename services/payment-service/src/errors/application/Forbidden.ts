import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class Forbidden extends ApplicationError {
  public override statusCode = 403
  public override code = ErrorCode.FORBIDDEN

  constructor() {
    super('Admin access required')
    this.name = 'Forbidden'
  }
}

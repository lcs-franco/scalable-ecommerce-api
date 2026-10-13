import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class Forbidden extends ApplicationError {
  public override statusCode = 403
  public override code = ErrorCode.FORBIDDEN

  constructor() {
    super('You do not have access to this resource')
    this.name = 'Forbidden'
  }
}

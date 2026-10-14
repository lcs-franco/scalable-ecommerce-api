import { ErrorCode } from '../ErrorCode.js'
import { HttpError } from './HttpError.js'

export class Forbidden extends HttpError {
  public override statusCode = 403
  public override code = ErrorCode.FORBIDDEN

  constructor() {
    super('Admin role required')
    this.name = 'Forbidden'
  }
}

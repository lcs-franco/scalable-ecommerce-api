import { CommonErrorCode } from '../ErrorCode.js'
import { HttpError } from './HttpError.js'

export class Forbidden extends HttpError {
  public override statusCode = 403
  public override code = CommonErrorCode.FORBIDDEN

  constructor(message = 'You do not have access to this resource') {
    super(message)
    this.name = 'Forbidden'
  }
}

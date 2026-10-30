import { CommonErrorCode } from '../ErrorCode.js'
import { HttpError } from './HttpError.js'

export class Unauthorized extends HttpError {
  public override statusCode = 401
  public override code = CommonErrorCode.UNAUTHORIZED

  constructor(message = 'Missing or invalid access token') {
    super(message)
    this.name = 'Unauthorized'
  }
}

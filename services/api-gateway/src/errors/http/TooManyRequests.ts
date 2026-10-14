import { ErrorCode } from '../ErrorCode.js'
import { HttpError } from './HttpError.js'

export class TooManyRequests extends HttpError {
  public override statusCode = 429
  public override code = ErrorCode.TOO_MANY_REQUESTS

  constructor() {
    super('Rate limit exceeded')
    this.name = 'TooManyRequests'
  }
}

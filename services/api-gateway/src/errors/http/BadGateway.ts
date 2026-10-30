import { HttpError } from '@ecommerce/http'
import { ErrorCode } from '../ErrorCode.js'

export class BadGateway extends HttpError {
  public override statusCode = 502
  public override code = ErrorCode.BAD_GATEWAY

  constructor() {
    super('Upstream service unavailable')
    this.name = 'BadGateway'
  }
}

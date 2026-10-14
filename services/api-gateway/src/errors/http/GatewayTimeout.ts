import { ErrorCode } from '../ErrorCode.js'
import { HttpError } from './HttpError.js'

export class GatewayTimeout extends HttpError {
  public override statusCode = 504
  public override code = ErrorCode.GATEWAY_TIMEOUT

  constructor() {
    super('Upstream service timed out')
    this.name = 'GatewayTimeout'
  }
}

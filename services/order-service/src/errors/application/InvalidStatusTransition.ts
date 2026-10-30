import { ApplicationError } from '@ecommerce/http'
import { ErrorCode } from '../ErrorCode.js'

export class InvalidStatusTransition extends ApplicationError {
  public override statusCode = 409
  public override code = ErrorCode.INVALID_STATUS_TRANSITION

  constructor(from: string, to: string) {
    super(`Cannot transition from '${from}' to '${to}'`)
    this.name = 'InvalidStatusTransition'
  }
}

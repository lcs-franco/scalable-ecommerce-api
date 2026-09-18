import { ErrorCode } from '../ErrorCode.js'
import { ApplicationError } from './ApplicationError.js'

export class EmailAlreadyInUse extends ApplicationError {
  public override statusCode = 409
  public override code = ErrorCode.EMAIL_ALREADY_IN_USE

  constructor() {
    super('Email already in use')
    this.name = 'EmailAlreadyInUse'
  }
}

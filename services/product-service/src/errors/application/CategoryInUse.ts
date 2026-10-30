import { ApplicationError } from '@ecommerce/http'
import { ErrorCode } from '../ErrorCode.js'

export class CategoryInUse extends ApplicationError {
  public override statusCode = 409
  public override code = ErrorCode.CATEGORY_IN_USE

  constructor() {
    super('Category has products referencing it')
    this.name = 'CategoryInUse'
  }
}

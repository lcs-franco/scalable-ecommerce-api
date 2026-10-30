import { ApplicationError } from '@ecommerce/http'
import { ErrorCode } from '../ErrorCode.js'

export class CategoryNotFound extends ApplicationError {
  public override statusCode = 404
  public override code = ErrorCode.CATEGORY_NOT_FOUND

  constructor() {
    super('Category not found')
    this.name = 'CategoryNotFound'
  }
}

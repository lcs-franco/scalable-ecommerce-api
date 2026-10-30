import { HttpError } from '@ecommerce/http'
import { ErrorCode } from '../ErrorCode.js'

export class RouteNotFound extends HttpError {
  public override statusCode = 404
  public override code = ErrorCode.NOT_FOUND

  constructor(method: string, url: string) {
    super(`Route ${method} ${url} not found`)
    this.name = 'RouteNotFound'
  }
}

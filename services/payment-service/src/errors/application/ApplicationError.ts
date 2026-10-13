import type { ErrorCode } from '../ErrorCode.js'

export abstract class ApplicationError extends Error {
  public abstract statusCode: number
  public abstract code: ErrorCode
}

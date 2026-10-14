import type { ErrorCode } from '../ErrorCode.js'

export abstract class HttpError extends Error {
  public abstract statusCode: number
  public abstract code: ErrorCode
}

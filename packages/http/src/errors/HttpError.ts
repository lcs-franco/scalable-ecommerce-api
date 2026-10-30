export abstract class HttpError extends Error {
  public abstract statusCode: number
  public abstract code: string
}

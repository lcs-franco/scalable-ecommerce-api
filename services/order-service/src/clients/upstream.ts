export interface IUpstreamError {
  status: number
  text: string
  code?: string
  message?: string
}

export async function readUpstreamError(
  res: Response,
): Promise<IUpstreamError> {
  const text = await res.text()
  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown }
    return {
      status: res.status,
      text,
      code: typeof body.error === 'string' ? body.error : undefined,
      message: typeof body.message === 'string' ? body.message : undefined,
    }
  } catch {
    return { status: res.status, text }
  }
}

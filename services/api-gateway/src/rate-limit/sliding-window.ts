export interface IWindowState {
  previous: number
  current: number
  elapsedMs: number
  windowMs: number
  limit: number
}

export interface IWindowDecision {
  allowed: boolean
  remaining: number
}

// Assumes the previous window's hits were evenly spread, so the part of it
// still inside the rolling window weighs `1 - elapsedMs / windowMs`.
export function evaluateWindow(state: IWindowState): IWindowDecision {
  const weight = 1 - state.elapsedMs / state.windowMs
  const estimate = state.previous * weight + state.current

  return {
    allowed: estimate <= state.limit,
    remaining: Math.max(0, Math.floor(state.limit - estimate)),
  }
}

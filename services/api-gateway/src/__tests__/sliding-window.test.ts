import { describe, expect, it } from 'vitest'
import { evaluateWindow } from '../rate-limit/sliding-window.js'

const windowMs = 60_000

describe('evaluateWindow', () => {
  it('allows up to the limit with no previous window', () => {
    expect(
      evaluateWindow({
        previous: 0,
        current: 30,
        elapsedMs: 0,
        windowMs,
        limit: 30,
      }),
    ).toEqual({ allowed: true, remaining: 0 })
  })

  it('denies once the current window exceeds the limit', () => {
    expect(
      evaluateWindow({
        previous: 0,
        current: 31,
        elapsedMs: 0,
        windowMs,
        limit: 30,
      }),
    ).toEqual({ allowed: false, remaining: 0 })
  })

  it('weighs the previous window by how much of it is still in the rolling window', () => {
    expect(
      evaluateWindow({
        previous: 20,
        current: 10,
        elapsedMs: 45_000,
        windowMs,
        limit: 30,
      }),
    ).toEqual({ allowed: true, remaining: 15 })
  })

  it('denies when the weighted previous hits push it over the limit', () => {
    const at = (current: number) =>
      evaluateWindow({
        previous: 30,
        current,
        elapsedMs: 30_000,
        windowMs,
        limit: 30,
      })

    expect(at(15)).toEqual({ allowed: true, remaining: 0 })
    expect(at(16)).toEqual({ allowed: false, remaining: 0 })
  })

  it('counts the previous window in full at the start of the current one', () => {
    expect(
      evaluateWindow({
        previous: 30,
        current: 1,
        elapsedMs: 0,
        windowMs,
        limit: 30,
      }),
    ).toEqual({ allowed: false, remaining: 0 })
  })

  it('never reports negative or fractional remaining', () => {
    const { remaining } = evaluateWindow({
      previous: 7,
      current: 1,
      elapsedMs: 20_000,
      windowMs,
      limit: 10,
    })
    expect(Number.isInteger(remaining)).toBe(true)
    expect(remaining).toBeGreaterThanOrEqual(0)
    expect(remaining).toBeLessThanOrEqual(10 - 1)
  })
})

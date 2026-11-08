import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js'

export const SUMMARY_TREND_STATS = [
  'avg',
  'min',
  'med',
  'max',
  'p(95)',
  'p(99)',
]

// Defining handleSummary drops k6's own end-of-test summary, so stdout gets it back
export function summary(scenario: string) {
  return (data: object) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')

    return {
      stdout: `${textSummary(data, { indent: ' ', enableColors: true })}\n`,
      [`results/${scenario}-${stamp}.json`]: JSON.stringify(data, null, 2),
    }
  }
}

import type { Options } from 'k6/options'
import { summary } from '../lib/summary.ts'
import { options as smoke } from './smoke.ts'

// The smoke journey on a ramp: the rate where p95 crosses its limit is where the limits make the platform saturate
export { default, setup } from './smoke.ts'

export const options: Options = {
  ...smoke,
  scenarios: {
    calibrate: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      stages: [
        { target: Number(__ENV.CALIBRATE_MAX_RATE || 100), duration: '5m' },
      ],
      preAllocatedVUs: 20,
      maxVUs: Number(__ENV.K6_USERS || 200),
    },
  },
}

export const handleSummary = summary('calibrate')

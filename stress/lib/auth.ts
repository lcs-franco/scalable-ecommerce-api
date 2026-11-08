import exec from 'k6/execution'
import { sendBatch } from './http.ts'
import { FIRST_PLAIN_USER, PASSWORD, USERS, email } from './world.ts'

const LOGIN_BATCH = 20

export interface ISession {
  user: number
  token: string
}

export function loginUsers(count = Number(__ENV.K6_USERS || 200)) {
  const first = FIRST_PLAIN_USER

  if (first + count > USERS) {
    throw new Error(
      `users ${first}–${first + count - 1} do not exist: the world has ${USERS} users (check SEED_*)`,
    )
  }

  const sessions: ISession[] = []

  for (let start = first; start < first + count; start += LOGIN_BATCH) {
    const users = Array.from(
      { length: Math.min(LOGIN_BATCH, first + count - start) },
      (_, i) => start + i,
    )

    const responses = sendBatch(
      users.map((user) => ({
        method: 'POST',
        route: '/api/auth/login',
        body: { email: email(user), password: PASSWORD },
      })),
    )

    responses.forEach((response, i) => {
      if (response.status !== 200) {
        throw new Error(`login of user ${users[i]} returned ${response.status}`)
      }

      const { accessToken } = response.json() as { accessToken: string }

      sessions.push({ user: users[i], token: accessToken })
    })
  }

  return sessions
}

// One user per VU: a VU runs one iteration at a time, so a cart never sees two checkouts at once
export function vuSession(sessions: ISession[]) {
  const vu = exec.vu.idInTest

  if (vu > sessions.length) {
    throw new Error(`VU ${vu} has no user of its own: raise K6_USERS`)
  }

  return sessions[vu - 1]
}

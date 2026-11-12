import Fastify from 'fastify'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  runService,
  type IServiceContext,
  type IServiceProcess,
} from '../index.js'

const config = { PORT: 0, METRICS_PORT: 0, LOG_LEVEL: 'silent' } as const

function fakeProcess() {
  const emitter = new EventEmitter()
  const exit = vi.fn<(code: number) => void>()

  const proc: IServiceProcess = {
    on: (signal, listener) => emitter.on(signal, listener),
    exit,
  }

  return { proc, exit, signal: (name: string) => emitter.emit(name) }
}

function appRecording(calls: string[]) {
  const app = Fastify()

  app.addHook('onClose', async () => {
    calls.push('app')
  })

  return app
}

async function start(
  setup: (ctx: IServiceContext) => Promise<ReturnType<typeof Fastify>>,
  shutdownTimeoutMs?: number,
) {
  const fake = fakeProcess()

  await runService(
    { name: 'test-service', config, process: fake.proc, shutdownTimeoutMs },
    setup,
  )

  return fake
}

describe('runService', () => {
  it('should close the app, then resources in reverse order, on SIGTERM', async () => {
    const calls: string[] = []

    const { exit, signal } = await start(async ({ onClose }) => {
      onClose('db', () => void calls.push('db'))
      onClose('kafka', () => void calls.push('kafka'))

      return appRecording(calls)
    })

    signal('SIGTERM')

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
    expect(calls).toEqual(['app', 'kafka', 'db'])
  })

  it('should keep closing after a close fails and exit 1', async () => {
    const calls: string[] = []

    const { exit, signal } = await start(async ({ onClose }) => {
      onClose('db', () => void calls.push('db'))
      onClose('kafka', () => {
        throw new Error('broker gone')
      })

      return appRecording(calls)
    })

    signal('SIGINT')

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))
    expect(calls).toEqual(['app', 'db'])
  })

  it('should exit 1 when the closes outlast the shutdown timeout', async () => {
    const { exit, signal } = await start(async ({ onClose }) => {
      onClose('stuck', () => new Promise(() => {}))

      return Fastify()
    }, 50)

    signal('SIGTERM')

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))
  })

  it('should close only once when signals repeat', async () => {
    const close = vi.fn()

    const { exit, signal } = await start(async ({ onClose }) => {
      onClose('db', close)

      return Fastify()
    })

    signal('SIGTERM')
    signal('SIGINT')

    await vi.waitFor(() => expect(exit).toHaveBeenCalled())
    expect(close).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledOnce()
  })

  it('should close what setup opened and exit 1 when setup fails', async () => {
    const calls: string[] = []

    const { exit } = await start(async ({ onClose }) => {
      onClose('db', () => void calls.push('db'))
      onClose('kafka', () => void calls.push('kafka'))

      throw new Error('migrations failed')
    })

    expect(exit).toHaveBeenCalledWith(1)
    expect(calls).toEqual(['kafka', 'db'])
  })

  it('should run afterListen work once the app is listening', async () => {
    let listeningWhenStarted: boolean | undefined
    let app: ReturnType<typeof Fastify> | undefined

    const { exit, signal } = await start(async ({ afterListen }) => {
      app = Fastify()

      afterListen(() => {
        listeningWhenStarted = app?.server.listening
      })

      return app
    })

    expect(listeningWhenStarted).toBe(true)

    signal('SIGTERM')

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
    expect(app?.server.listening).toBe(false)
  })

  it('should close everything and exit 1 when afterListen work fails', async () => {
    const calls: string[] = []

    const { exit } = await start(async ({ onClose, afterListen }) => {
      onClose('db', () => void calls.push('db'))
      afterListen(() => {
        throw new Error('relay failed')
      })

      return appRecording(calls)
    })

    expect(exit).toHaveBeenCalledWith(1)
    expect(calls).toEqual(['app', 'db'])
  })
})

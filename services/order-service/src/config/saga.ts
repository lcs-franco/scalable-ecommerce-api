type CompensationFn = () => Promise<void>

export function saga() {
  const compensations: CompensationFn[] = []

  function addCompensation(fn: CompensationFn) {
    compensations.unshift(fn)
  }

  async function run<TResult>(fn: () => Promise<TResult>) {
    try {
      return await fn()
    } catch (error) {
      await compensate()

      throw error
    }
  }

  async function compensate() {
    for await (const compensation of compensations) {
      try {
        await compensation()
      } catch {
        // empty
      }
    }
  }

  return { addCompensation, run }
}

import { describe, it, expect, vi } from 'vitest'
import { initWithRetry } from '../../src/bot/init-with-retry.js'

const noSleep = () => Promise.resolve()

describe('initWithRetry', () => {
  it('успех с первой попытки → init один раз, без onAttemptFail', async () => {
    const init = vi.fn().mockResolvedValue(undefined)
    const onAttemptFail = vi.fn()
    await initWithRetry({
      init,
      timeoutMs: 1000,
      baseDelayMs: 10,
      maxDelayMs: 100,
      onAttemptFail,
      sleep: noSleep,
    })
    expect(init).toHaveBeenCalledTimes(1)
    expect(onAttemptFail).not.toHaveBeenCalled()
  })

  it('падает дважды, потом успех → 3 попытки, 2 фейла, backoff растёт', async () => {
    const init = vi
      .fn()
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValue(undefined)
    const delays: number[] = []
    await initWithRetry({
      init,
      timeoutMs: 1000,
      baseDelayMs: 10,
      maxDelayMs: 1000,
      onAttemptFail: (_a, _e, next) => delays.push(next),
      sleep: noSleep,
    })
    expect(init).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([10, 20]) // 10*2^0, 10*2^1
  })

  it('backoff не превышает maxDelay', async () => {
    let calls = 0
    const init = vi.fn(() => {
      calls++
      return calls < 5 ? Promise.reject(new Error('x')) : Promise.resolve()
    })
    const delays: number[] = []
    await initWithRetry({
      init,
      timeoutMs: 1000,
      baseDelayMs: 100,
      maxDelayMs: 250,
      onAttemptFail: (_a, _e, n) => delays.push(n),
      sleep: noSleep,
    })
    expect(delays).toEqual([100, 200, 250, 250]) // capped at 250
  })
})

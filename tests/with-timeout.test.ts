import { describe, it, expect, vi, afterEach } from 'vitest'
import { withTimeout } from '../src/with-timeout.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('возвращает значение, если промис успел до таймаута', async () => {
    const r = await withTimeout(Promise.resolve('ok'), 1000, 'op')
    expect(r).toBe('ok')
  })

  it('пробрасывает ошибку промиса как есть', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'op')).rejects.toThrow('boom')
  })

  it('реджектит с таймаут-ошибкой (с label и ms), если промис не успел', async () => {
    vi.useFakeTimers()
    const never = new Promise<string>(() => {})
    const p = withTimeout(never, 15000, 'bot.init')
    const assertion = expect(p).rejects.toThrow(/bot\.init.*15000ms/)
    await vi.advanceTimersByTimeAsync(15000)
    await assertion
  })
})

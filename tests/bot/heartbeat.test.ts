import { describe, it, expect, vi } from 'vitest'
import { createLiveness, heartbeatTick, type HeartbeatOpts } from '../../src/bot/heartbeat.js'

describe('createLiveness', () => {
  it('markOk фиксирует время и сбрасывает счётчик неудач', () => {
    const l = createLiveness()
    l.markFail()
    l.markFail()
    l.markOk(1000)
    expect(l.snapshot()).toEqual({ lastTelegramOkAt: 1000, consecutiveFails: 0 })
  })

  it('markFail инкрементит и возвращает счётчик', () => {
    const l = createLiveness()
    expect(l.markFail()).toBe(1)
    expect(l.markFail()).toBe(2)
    expect(l.snapshot().consecutiveFails).toBe(2)
  })
})

describe('heartbeatTick', () => {
  const base = (over: Partial<HeartbeatOpts> = {}): HeartbeatOpts => ({
    probe: () => Promise.resolve('me'),
    liveness: createLiveness(),
    timeoutMs: 1000,
    maxFails: 2,
    onDead: vi.fn(),
    now: () => 5000,
    ...over,
  })

  it('успешная проба → markOk, onDead не зовётся', async () => {
    const o = base()
    await heartbeatTick(o)
    expect(o.liveness.snapshot().lastTelegramOkAt).toBe(5000)
    expect(o.onDead).not.toHaveBeenCalled()
  })

  it('неудача ниже порога → onDead не зовётся, счётчик растёт', async () => {
    const o = base({ probe: () => Promise.reject(new Error('x')) })
    await heartbeatTick(o)
    expect(o.liveness.snapshot().consecutiveFails).toBe(1)
    expect(o.onDead).not.toHaveBeenCalled()
  })

  it('неудача достигла порога → onDead(fails)', async () => {
    const l = createLiveness()
    l.markFail() // уже 1
    const o = base({ probe: () => Promise.reject(new Error('x')), liveness: l })
    await heartbeatTick(o)
    expect(o.onDead).toHaveBeenCalledWith(2)
  })

  it('зависшая проба (> timeout) считается неудачей', async () => {
    vi.useFakeTimers()
    const o = base({ probe: () => new Promise(() => {}), maxFails: 1 })
    const p = heartbeatTick(o)
    await vi.advanceTimersByTimeAsync(1000)
    await p
    expect(o.onDead).toHaveBeenCalledWith(1)
    vi.useRealTimers()
  })
})

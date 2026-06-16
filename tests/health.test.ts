import { describe, it, expect } from 'vitest'
import { buildHealth, type HealthInputs } from '../src/health.js'

const NOW = 1_000_000_000_000

const base = (over: Partial<HealthInputs> = {}): HealthInputs => ({
  now: NOW,
  runnerRunning: true,
  liveness: { lastTelegramOkAt: NOW - 30_000, consecutiveFails: 0 },
  pollingStaleMs: 600_000,
  lastEventAt: () => Promise.resolve(NOW - 120_000),
  diskUsedPct: () => Promise.resolve(14),
  ...over,
})

describe('buildHealth', () => {
  it('всё здорово → ok, polling, ydb; возрасты посчитаны', async () => {
    const r = await buildHealth(base())
    expect(r).toEqual({
      ok: true,
      polling: true,
      telegramOkAgeSec: 30,
      ydb: true,
      lastEventAgeMin: 2,
      diskUsedPct: 14,
    })
  })

  it('Telegram-проба протухла → polling=false, ok=false', async () => {
    const r = await buildHealth(base({ liveness: { lastTelegramOkAt: NOW - 700_000, consecutiveFails: 1 } }))
    expect(r.polling).toBe(false)
    expect(r.ok).toBe(false)
  })

  it('runner не работает → polling=false', async () => {
    const r = await buildHealth(base({ runnerRunning: false }))
    expect(r.polling).toBe(false)
    expect(r.ok).toBe(false)
  })

  it('запрос события упал → ydb=false, ok=false, lastEventAgeMin=null', async () => {
    const r = await buildHealth(base({ lastEventAt: () => Promise.reject(new Error('ydb down')) }))
    expect(r.ydb).toBe(false)
    expect(r.ok).toBe(false)
    expect(r.lastEventAgeMin).toBeNull()
  })

  it('событий нет (null) → lastEventAgeMin=null, но ydb=true', async () => {
    const r = await buildHealth(base({ lastEventAt: () => Promise.resolve(null) }))
    expect(r.lastEventAgeMin).toBeNull()
    expect(r.ydb).toBe(true)
  })

  it('диск недоступен → diskUsedPct=null, на ok не влияет', async () => {
    const r = await buildHealth(base({ diskUsedPct: () => Promise.reject(new Error('no statfs')) }))
    expect(r.diskUsedPct).toBeNull()
    expect(r.ok).toBe(true)
  })

  it('Telegram никогда не отвечал (null) → telegramOkAgeSec=null, polling=false', async () => {
    const r = await buildHealth(base({ liveness: { lastTelegramOkAt: null, consecutiveFails: 3 } }))
    expect(r.telegramOkAgeSec).toBeNull()
    expect(r.polling).toBe(false)
  })
})

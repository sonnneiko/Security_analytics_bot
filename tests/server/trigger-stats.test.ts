import { describe, it, expect } from 'vitest'
import type { Driver } from 'ydb-sdk'
import { triggerStatsRoute } from '../../src/server/trigger-stats.js'

const TOKEN = 'x'.repeat(40)

// Драйвер, который взрывается при любом обращении к БД — доказывает, что
// проверки авторизации и валидации происходят ДО доступа к данным.
const explodingDriver = new Proxy({} as Driver, {
  get() {
    throw new Error('driver must not be touched before auth/validation passes')
  },
})

function req(app: ReturnType<typeof triggerStatsRoute>, path: string, headers?: Record<string, string>) {
  return app.request(path, { method: 'GET', headers })
}

const VALID = '/internal/trigger-stats?from=2026-05-04&to=2026-05-18'
const AUTH = { Authorization: `Bearer ${TOKEN}` }

describe('triggerStatsRoute auth', () => {
  it('401 без заголовка Authorization', async () => {
    const app = triggerStatsRoute(TOKEN, explodingDriver)
    const res = await req(app, VALID)
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('')
  })

  it('401 при неверном токене', async () => {
    const app = triggerStatsRoute(TOKEN, explodingDriver)
    const res = await req(app, VALID, { Authorization: 'Bearer wrong' })
    expect(res.status).toBe(401)
  })

  it('401 при токене другой длины (без падения timingSafeEqual)', async () => {
    const app = triggerStatsRoute(TOKEN, explodingDriver)
    const res = await req(app, VALID, { Authorization: `Bearer ${'x'.repeat(80)}` })
    expect(res.status).toBe(401)
  })
})

describe('triggerStatsRoute validation', () => {
  const app = () => triggerStatsRoute(TOKEN, explodingDriver)

  it('400 без from/to', async () => {
    const res = await req(app(), '/internal/trigger-stats', AUTH)
    expect(res.status).toBe(400)
  })

  it('400 при битом формате даты', async () => {
    const res = await req(app(), '/internal/trigger-stats?from=2026-5-4&to=2026-05-18', AUTH)
    expect(res.status).toBe(400)
  })

  it('400 при from >= to', async () => {
    const res = await req(app(), '/internal/trigger-stats?from=2026-05-18&to=2026-05-04', AUTH)
    expect(res.status).toBe(400)
  })

  it('400 при равных from и to', async () => {
    const res = await req(app(), '/internal/trigger-stats?from=2026-05-04&to=2026-05-04', AUTH)
    expect(res.status).toBe(400)
  })

  it('400 при слишком большом диапазоне (> 370 дней)', async () => {
    const res = await req(app(), '/internal/trigger-stats?from=2024-01-01&to=2026-01-01', AUTH)
    expect(res.status).toBe(400)
  })
})

import { statfs } from 'node:fs/promises'
import type { LivenessSnapshot } from './bot/heartbeat.js'

// Процент занятости ФС (для /healthz). Бросает, если statfs недоступен — buildHealth ловит.
export async function diskUsedPctOf(path = '/'): Promise<number> {
  const s = await statfs(path)
  return Math.round((1 - Number(s.bavail) / Number(s.blocks)) * 100)
}

export interface HealthInputs {
  now: number
  runnerRunning: boolean
  liveness: LivenessSnapshot
  pollingStaleMs: number // если последняя успешная Telegram-проба старше — polling нездоров
  lastEventAt: () => Promise<number | null> // epoch ms MAX(occurred_at), null если событий нет
  diskUsedPct: () => Promise<number | null>
}

export interface HealthReport {
  ok: boolean // итог: polling && ydb (диск — информационно, на ok не влияет)
  polling: boolean
  telegramOkAgeSec: number | null
  ydb: boolean
  lastEventAgeMin: number | null
  diskUsedPct: number | null
}

export async function buildHealth(i: HealthInputs): Promise<HealthReport> {
  const okAt = i.liveness.lastTelegramOkAt
  const telegramFresh = okAt !== null && i.now - okAt <= i.pollingStaleMs
  const polling = i.runnerRunning && telegramFresh
  const telegramOkAgeSec = okAt === null ? null : Math.floor((i.now - okAt) / 1000)

  let ydb = true
  let lastEventAgeMin: number | null = null
  try {
    const ev = await i.lastEventAt()
    lastEventAgeMin = ev === null ? null : Math.floor((i.now - ev) / 60_000)
  } catch {
    ydb = false
  }

  let diskUsedPct: number | null = null
  try {
    diskUsedPct = await i.diskUsedPct()
  } catch {
    diskUsedPct = null
  }

  return { ok: polling && ydb, polling, telegramOkAgeSec, ydb, lastEventAgeMin, diskUsedPct }
}

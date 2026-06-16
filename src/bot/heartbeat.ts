import { withTimeout } from '../with-timeout.js'

export interface LivenessSnapshot {
  lastTelegramOkAt: number | null // epoch ms последней успешной пробы Telegram
  consecutiveFails: number
}

export interface Liveness {
  markOk(nowMs: number): void
  markFail(): number // возвращает новый счётчик подряд-неудач
  snapshot(): LivenessSnapshot
}

export function createLiveness(): Liveness {
  let lastTelegramOkAt: number | null = null
  let consecutiveFails = 0
  return {
    markOk(nowMs) {
      lastTelegramOkAt = nowMs
      consecutiveFails = 0
    },
    markFail() {
      return ++consecutiveFails
    },
    snapshot() {
      return { lastTelegramOkAt, consecutiveFails }
    },
  }
}

export interface HeartbeatOpts {
  probe: () => Promise<unknown> // активная проба, напр. () => bot.api.getMe()
  liveness: Liveness
  timeoutMs: number
  maxFails: number // после скольких подряд-неудач звать onDead
  onDead: (fails: number) => void
  now: () => number
}

// Один тик: активно дёргает Telegram. Успех — фиксируем живость; неудача (в т.ч.
// зависание дольше timeoutMs) — копим счётчик и при достижении порога зовём onDead.
export async function heartbeatTick(opts: HeartbeatOpts): Promise<void> {
  try {
    await withTimeout(opts.probe(), opts.timeoutMs, 'heartbeat getMe')
    opts.liveness.markOk(opts.now())
  } catch {
    const fails = opts.liveness.markFail()
    if (fails >= opts.maxFails) opts.onDead(fails)
  }
}

// Запускает периодический heartbeat. Возвращает stop() для остановки таймера.
export function startHeartbeat(
  opts: Omit<HeartbeatOpts, 'now'> & { intervalMs: number; now?: () => number },
): { stop: () => void } {
  const now = opts.now ?? (() => Date.now())
  const timer = setInterval(() => {
    void heartbeatTick({ ...opts, now })
  }, opts.intervalMs)
  timer.unref?.()
  return { stop: () => clearInterval(timer) }
}

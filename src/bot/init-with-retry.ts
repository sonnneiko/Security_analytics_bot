import { withTimeout } from '../with-timeout.js'

export interface InitWithRetryOpts {
  init: () => Promise<void> // обычно () => bot.init()
  timeoutMs: number // таймаут одной попытки (getMe виснет без него)
  baseDelayMs: number
  maxDelayMs: number
  onAttemptFail: (attempt: number, err: unknown, nextDelayMs: number) => void
  sleep: (ms: number) => Promise<void>
}

// Ретраит bot.init() с экспоненциальным backoff БЕЗ падения процесса: при недоступном
// Telegram бот просто остаётся жив и переподключается, пока не получится. Polling
// стартует только после успешного init. /healthz всё это время отдаёт polling=false.
export async function initWithRetry(opts: InitWithRetryOpts): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await withTimeout(opts.init(), opts.timeoutMs, 'bot.init')
      return
    } catch (err) {
      const nextDelayMs = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (attempt - 1))
      opts.onAttemptFail(attempt, err, nextDelayMs)
      await opts.sleep(nextDelayMs)
    }
  }
}

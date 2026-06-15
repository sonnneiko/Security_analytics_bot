import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'
import type { Driver } from 'ydb-sdk'
import { selectEventsForPeriod } from '../database/queries/telegram-events.js'
import { listEmployees } from '../database/queries/employees.js'
import { listTriggerChats } from '../database/queries/trigger-chats.js'
import { uniqueTriggersByWeek } from '../reports/aggregate.js'
import { mskToUtc } from '../reports/period.js'

const BEARER = 'Bearer '
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 370
const DAY_MS = 86_400_000

// Сравнение токена за константное время. Разная длина → reject сразу
// (timingSafeEqual требует буферы равной длины).
function tokenEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// «YYYY-MM-DD как полночь МСК» → UTC-инстант
function mskDateToUtc(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  return mskToUtc(y, m - 1, d)
}

export function triggerStatsRoute(statsToken: string, driver: Driver): Hono {
  const app = new Hono()

  app.get('/internal/trigger-stats', async (c) => {
    const auth = c.req.header('Authorization') ?? ''
    if (!auth.startsWith(BEARER) || !tokenEquals(auth.slice(BEARER.length), statsToken)) {
      return c.body(null, 401)
    }

    const from = c.req.query('from')
    const to = c.req.query('to')
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from >= to) {
      return c.body(null, 400)
    }

    const fromUtc = mskDateToUtc(from)
    const toUtc = mskDateToUtc(to)
    if (toUtc.getTime() - fromUtc.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      return c.body(null, 400)
    }

    const [rows, employees, chats] = await Promise.all([
      selectEventsForPeriod(driver, fromUtc, toUtc),
      listEmployees(driver),
      listTriggerChats(driver),
    ])
    const employeeIds = new Set(employees.map((e) => e.telegram_id))
    const chatIds = new Set(chats.map((ch) => ch.chat_id))
    const weeks = uniqueTriggersByWeek(rows, employeeIds, chatIds)
    return c.json({ weeks })
  })

  return app
}

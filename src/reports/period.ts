const MSK_OFFSET_MS = 3 * 60 * 60 * 1000
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export interface ResolvedPeriod {
  from: Date // UTC, включительно
  to: Date // UTC, исключительно
  sheetLabel: string // «Май 2026» / «Неделя 21 (18.05 — 24.05)»
  rangeLabel: string // «01.05.2026 — 31.05.2026»
  fileName: string
}

// МСК-настенное время (Y,M0,D,h) → момент UTC
export function mskToUtc(y: number, m0: number, d: number, h = 0): Date {
  return new Date(Date.UTC(y, m0, d, h) - MSK_OFFSET_MS)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function nowMsk(): Date {
  return new Date(Date.now() + MSK_OFFSET_MS) // поля .getUTC* = МСК-настенные
}

// Понедельник ISO-недели как UTC-полночь (для арифметики недель)
function isoWeekMonday(year: number, week: number): Date {
  // 4 января всегда в 1-й ISO-неделе
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Dow = (jan4.getUTCDay() + 6) % 7 // 0=пн
  const week1Monday = new Date(jan4.getTime() - jan4Dow * 86400000)
  return new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000)
}

function isoWeekOf(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dow + 3) // четверг текущей недели
  const year = date.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Dow = (jan4.getUTCDay() + 6) % 7
  const week1Monday = new Date(jan4.getTime() - jan4Dow * 86400000)
  const week = Math.round((date.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1
  return { year, week }
}

// UTC-инстант occurred_at → понедельник его ISO-недели (МСК) как YYYY-MM-DD
export function isoWeekMondayMsk(occurredAt: Date): string {
  const msk = new Date(occurredAt.getTime() + MSK_OFFSET_MS) // поля .getUTC* = МСК-настенные
  const { year, week } = isoWeekOf(msk)
  const monday = isoWeekMonday(year, week)
  return `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`
}

export function resolvePeriod(kind: 'week' | 'month', arg?: string): ResolvedPeriod {
  if (kind === 'month') {
    let year: number, month1: number // month1 = 1..12
    if (arg) {
      const m = /^(\d{4})-(\d{2})$/.exec(arg)
      if (!m) throw new Error(`Неверный формат месяца: ${arg} (ожидается YYYY-MM)`)
      year = Number(m[1]); month1 = Number(m[2])
      if (month1 < 1 || month1 > 12) throw new Error(`Неверный месяц: ${arg}`)
    } else {
      const n = nowMsk(); year = n.getUTCFullYear(); month1 = n.getUTCMonth() + 1
    }
    const from = mskToUtc(year, month1 - 1, 1)
    const to = mskToUtc(month1 === 12 ? year + 1 : year, month1 === 12 ? 0 : month1, 1)
    const lastDay = new Date(Date.UTC(year, month1, 0)).getUTCDate()
    return {
      from, to,
      sheetLabel: `${MONTHS_RU[month1 - 1]} ${year}`,
      rangeLabel: `01.${pad2(month1)}.${year} — ${pad2(lastDay)}.${pad2(month1)}.${year}`,
      fileName: `СБ_отчёт_${year}-${pad2(month1)}.xlsx`,
    }
  }

  // week
  let year: number, week: number
  if (arg) {
    const m = /^(\d{4})-W(\d{2})$/.exec(arg)
    if (!m) throw new Error(`Неверный формат недели: ${arg} (ожидается YYYY-Www)`)
    year = Number(m[1]); week = Number(m[2])
    if (week < 1 || week > 53) throw new Error(`Неверная неделя: ${arg}`)
  } else {
    const w = isoWeekOf(nowMsk()); year = w.year; week = w.week
  }
  const monday = isoWeekMonday(year, week) // UTC-полночь понедельника (как «настенная» дата)
  const sunday = new Date(monday.getTime() + 6 * 86400000)
  const from = mskToUtc(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate())
  const to = mskToUtc(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 7)
  const fmt = (x: Date) => `${pad2(x.getUTCDate())}.${pad2(x.getUTCMonth() + 1)}`
  return {
    from, to,
    sheetLabel: `Неделя ${week} (${fmt(monday)} — ${fmt(sunday)})`,
    rangeLabel: `${fmt(monday)}.${monday.getUTCFullYear()} — ${fmt(sunday)}.${sunday.getUTCFullYear()}`,
    fileName: `СБ_отчёт_${year}-W${pad2(week)}.xlsx`,
  }
}

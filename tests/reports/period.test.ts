import { describe, it, expect } from 'vitest'
import { resolvePeriod, isoWeekMondayMsk, mskToUtc } from '../../src/reports/period.js'

describe('isoWeekMondayMsk', () => {
  it('инстант внутри недели → понедельник ISO-недели (МСК) YYYY-MM-DD', () => {
    // 2026-05-06T10:00 МСК (среда) → понедельник 2026-05-04
    const d = mskToUtc(2026, 4, 6, 10)
    expect(isoWeekMondayMsk(d)).toBe('2026-05-04')
  })

  it('учитывает сдвиг МСК на границе суток (UTC-вс → МСК-пн)', () => {
    // 2026-05-03T21:30Z = 2026-05-04T00:30 МСК (понедельник) → 2026-05-04,
    // а не неделя предыдущего понедельника (как было бы по UTC-воскресенью)
    const d = new Date('2026-05-03T21:30:00.000Z')
    expect(isoWeekMondayMsk(d)).toBe('2026-05-04')
  })

  it('неделя на стыке месяцев → понедельник в предыдущем месяце', () => {
    // пятница 2026-05-01 12:00 МСК принадлежит неделе понедельника 2026-04-27
    const d = mskToUtc(2026, 4, 1, 12)
    expect(isoWeekMondayMsk(d)).toBe('2026-04-27')
  })
})

describe('resolvePeriod month', () => {
  it('явный месяц → границы UTC, лейблы, имя файла', () => {
    const p = resolvePeriod('month', '2026-05')
    // 2026-05-01 00:00 МСК = 2026-04-30 21:00 UTC
    expect(p.from.toISOString()).toBe('2026-04-30T21:00:00.000Z')
    // 2026-06-01 00:00 МСК = 2026-05-31 21:00 UTC
    expect(p.to.toISOString()).toBe('2026-05-31T21:00:00.000Z')
    expect(p.sheetLabel).toBe('Май 2026')
    expect(p.rangeLabel).toBe('01.05.2026 — 31.05.2026')
    expect(p.fileName).toBe('СБ_отчёт_2026-05.xlsx')
  })

  it('невалидный месяц → бросает', () => {
    expect(() => resolvePeriod('month', '2026-13')).toThrow()
  })
})

describe('resolvePeriod week', () => {
  it('явная ISO-неделя → пн..вс, лейблы, имя файла', () => {
    const p = resolvePeriod('week', '2026-W21')
    // ISO неделя 21 2026: понедельник 2026-05-18
    expect(p.from.toISOString()).toBe('2026-05-17T21:00:00.000Z') // 18.05 00:00 МСК
    expect(p.to.toISOString()).toBe('2026-05-24T21:00:00.000Z') // 25.05 00:00 МСК
    expect(p.sheetLabel).toBe('Неделя 21 (18.05 — 24.05)')
    expect(p.fileName).toBe('СБ_отчёт_2026-W21.xlsx')
  })
})

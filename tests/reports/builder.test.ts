import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildWorkbook } from '../../src/reports/builder.js'
import type { ReportData } from '../../src/reports/aggregate.js'

const data: ReportData = {
  employees: [
    { telegram_id: 1, full_name: 'Ани Тоноян', tg: { handled: 320, unique: 188 }, teamly: { created: 16, commented: 42 } },
    { telegram_id: 2, full_name: 'Светлана', tg: { handled: 430, unique: 168 }, teamly: { created: 22, commented: 47 } },
  ],
  chatsActive: [
    {
      chat_id: -1,
      title: 'Юрлица',
      perEmployee: [
        { telegram_id: 1, full_name: 'Ани Тоноян', handled: 271, unique: 139 },
        { telegram_id: 2, full_name: 'Светлана', handled: 363, unique: 126 },
      ],
      handled: 634,
      unique: 265,
    },
  ],
  chatsEmpty: [{ chat_id: -2, title: 'Резервный чат' }],
  totals: { handled: 750, unique: 356, created: 38, commented: 89 },
  activeChats: 1,
  employeeCount: 2,
}
const period = { sheetLabel: 'Май 2026', rangeLabel: '01.05.2026 — 31.05.2026', fileName: 'СБ_отчёт_2026-05.xlsx' }

describe('buildWorkbook', () => {
  it('создаёт 3 листа: Триггеры, Teamly, Итоги', async () => {
    const buf = await buildWorkbook(data, period)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as any)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Триггеры', 'Teamly', 'Итоги'])
  })

  it('лист «Триггеры»: секции по чатам с подытогом, блок «Без активности», финальный ИТОГО', async () => {
    const buf = await buildWorkbook(data, period)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as any)
    const ws = wb.getWorksheet('Триггеры')!
    const text = JSON.stringify(ws.getSheetValues())
    expect(text).toContain('▸ Юрлица')
    expect(text).toContain('Ани Тоноян')
    expect(text).toContain('Светлана')
    expect(text).toContain('∑ по чату')
    expect(text).toContain('▸ Без активности за период')
    expect(text).toContain('Резервный чат')
    expect(text).toContain('ИТОГО ПО ВСЕМ')
    expect(text).toContain('750')
  })

  it('лист «Teamly»: колонка «Всего» = создал + комментариев, ИТОГО через SUM', async () => {
    const buf = await buildWorkbook(data, period)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as any)
    const ws = wb.getWorksheet('Teamly')!
    const text = JSON.stringify(ws.getSheetValues())
    expect(text).toContain('Всего')
    expect(text).toContain('Ани Тоноян')
    // в данных есть SUM-формула для строки ИТОГО
    const hasSum = ws.getRows(1, ws.rowCount)!.some((r) =>
      r.values && JSON.stringify(r.values).includes('SUM'),
    )
    expect(hasSum).toBe(true)
  })
})

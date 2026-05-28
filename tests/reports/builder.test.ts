import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildWorkbook } from '../../src/reports/builder.js'
import type { ReportData } from '../../src/reports/aggregate.js'

const data: ReportData = {
  employees: [
    { telegram_id: 1, full_name: 'Ани Тоноян', tg: { handled: 320, unique: 188 }, teamly: { created: 16, commented: 42 }, perChat: [{ chat_id: -1, title: 'Юрлица', handled: 271, unique: 139 }] },
    { telegram_id: 2, full_name: 'Светлана', tg: { handled: 430, unique: 168 }, teamly: { created: 22, commented: 47 }, perChat: [{ chat_id: -1, title: 'Юрлица', handled: 363, unique: 126 }] },
  ],
  totals: { handled: 750, unique: 356, created: 38, commented: 89 },
  activeChats: 1,
  employeeCount: 2,
}
const period = { sheetLabel: 'Май 2026', rangeLabel: '01.05.2026 — 31.05.2026', fileName: 'СБ_отчёт_2026-05.xlsx' }

describe('buildWorkbook', () => {
  it('создаёт 3 листа с нужными заголовками', async () => {
    const buf = await buildWorkbook(data, period)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as any)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['По чатам', 'По сотрудникам', 'Итоги'])
  })

  it('лист «По сотрудникам» содержит итог формулой и значения', async () => {
    const buf = await buildWorkbook(data, period)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as any)
    const ws = wb.getWorksheet('По сотрудникам')!
    const text = JSON.stringify(ws.getSheetValues())
    expect(text).toContain('Ани Тоноян')
    expect(text).toContain('320')
    // в строке «Итого» есть SUM-формула
    const hasSum = ws.getRows(1, ws.rowCount)!.some((r) =>
      r.values && JSON.stringify(r.values).includes('SUM'))
    expect(hasSum).toBe(true)
  })
})

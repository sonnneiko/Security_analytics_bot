import ExcelJS from 'exceljs'
import type { ReportData } from './aggregate.js'

interface PeriodMeta { sheetLabel: string; rangeLabel: string; fileName: string }

const PURPLE = 'FF5A3E85'
const PURPLE_EMP = 'FF6F4CA6'
const GREEN_SUB = 'FFD9F0D3'
const GREEN_FINAL = 'FF2F7D32'
const BLUE_TG = 'FFE3F0FB'
const GREEN_TM = 'FFE6F4E6'

function fill(cell: ExcelJS.Cell, argb: string, white = false): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  cell.font = { bold: true, color: white ? { argb: 'FFFFFFFF' } : undefined }
}

export async function buildWorkbook(data: ReportData, period: PeriodMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  // ── Лист 1: По чатам ──
  const s1 = wb.addWorksheet('По чатам')
  s1.addRow([`СБ — Активность по чатам · ${period.sheetLabel}`])
  s1.mergeCells('A1:C1')
  const head1 = s1.addRow(['Сотрудник / Чат', 'Обработано триггеров', 'Уникальные триггеры'])
  head1.eachCell((c) => fill(c, PURPLE, true))
  for (const emp of data.employees) {
    const er = s1.addRow([`👤 ${emp.full_name}`, '', ''])
    er.eachCell((c) => fill(c, PURPLE_EMP, true))
    for (const ch of emp.perChat) s1.addRow([ch.title, ch.handled, ch.unique])
    const sr = s1.addRow([`∑ Итого ${emp.full_name}`, emp.tg.handled, emp.tg.unique])
    sr.eachCell((c) => fill(c, GREEN_SUB))
  }
  const f1 = s1.addRow(['📊 ИТОГО', data.totals.handled, data.totals.unique])
  f1.eachCell((c) => fill(c, GREEN_FINAL, true))
  s1.columns.forEach((c) => (c.width = 26))

  // ── Лист 2: По сотрудникам ──
  const s2 = wb.addWorksheet('По сотрудникам')
  s2.addRow([`СБ — Сводка по сотрудникам · ${period.sheetLabel} (${period.rangeLabel})`])
  s2.mergeCells('A1:E1')
  const head2 = s2.addRow(['Сотрудник', 'TG: Обработано триггеров', 'TG: Уникальные триггеры', 'Teamly: Создал', 'Teamly: Комментариев'])
  head2.eachCell((c) => fill(c, PURPLE, true))
  const firstDataRow = s2.rowCount + 1
  for (const emp of data.employees) {
    const r = s2.addRow([emp.full_name, emp.tg.handled, emp.tg.unique, emp.teamly.created, emp.teamly.commented])
    fill2(r)
  }
  const lastDataRow = s2.rowCount
  const totalRow = s2.addRow([
    'Итого',
    { formula: `SUM(B${firstDataRow}:B${lastDataRow})` },
    { formula: `SUM(C${firstDataRow}:C${lastDataRow})` },
    { formula: `SUM(D${firstDataRow}:D${lastDataRow})` },
    { formula: `SUM(E${firstDataRow}:E${lastDataRow})` },
  ])
  totalRow.eachCell((c) => fill(c, GREEN_FINAL, true))
  s2.columns.forEach((c) => (c.width = 24))

  // ── Лист 3: Итоги ──
  const s3 = wb.addWorksheet('Итоги')
  s3.addRow([`СБ — Итоги периода · ${period.sheetLabel}`])
  s3.mergeCells('A1:B1')
  s3.addRow(['Период', period.rangeLabel])
  s3.addRow(['Сотрудников в работе', data.employeeCount])
  const tgHead = s3.addRow(['Telegram', '']); fill(tgHead.getCell(1), PURPLE, true)
  s3.addRow(['Обработано триггеров', data.totals.handled])
  s3.addRow(['Уникальных триггеров', data.totals.unique])
  s3.addRow(['Активных trigger-чатов', data.activeChats])
  const tmHead = s3.addRow(['Teamly', '']); fill(tmHead.getCell(1), PURPLE, true)
  s3.addRow(['Создано карточек', data.totals.created])
  s3.addRow(['Комментариев', data.totals.commented])
  s3.getColumn(1).width = 28; s3.getColumn(2).width = 26

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}

function fill2(row: ExcelJS.Row): void {
  row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_TG } }
  row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_TG } }
  row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_TM } }
  row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_TM } }
}

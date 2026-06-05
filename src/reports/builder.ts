import ExcelJS from 'exceljs'
import type { ReportData } from './aggregate.js'

interface PeriodMeta {
  sheetLabel: string
  rangeLabel: string
  fileName: string
}

const PURPLE = 'FF5A3E85'
const PURPLE_CHAT = 'FF6F4CA6'
const GREEN_SUB = 'FFD9F0D3'
const GREEN_FINAL = 'FF2F7D32'
const GRAY = 'FF8A8A8A'
const GREEN_TM = 'FFE6F4E6'

function fill(cell: ExcelJS.Cell, argb: string, white = false): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  cell.font = { bold: true, color: white ? { argb: 'FFFFFFFF' } : undefined }
}

export async function buildWorkbook(data: ReportData, period: PeriodMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  // ── Лист 1: Триггеры (секции по чатам) ──
  const s1 = wb.addWorksheet('Триггеры')
  s1.addRow([`СБ — Триггеры · ${period.sheetLabel}`])
  s1.mergeCells('A1:C1')
  const head1 = s1.addRow(['Чат / Сотрудник', 'Обработано', 'Уникальные'])
  head1.eachCell((c) => fill(c, PURPLE, true))

  for (const chat of data.chatsActive) {
    const cr = s1.addRow([`▸ ${chat.title}`, '', ''])
    cr.eachCell((c) => fill(c, PURPLE_CHAT, true))
    for (const e of chat.perEmployee) {
      s1.addRow([`   ${e.full_name}`, e.handled, e.unique])
    }
    const sr = s1.addRow(['∑ по чату', chat.handled, chat.unique])
    sr.eachCell((c) => fill(c, GREEN_SUB))
  }

  if (data.chatsEmpty.length > 0) {
    const er = s1.addRow(['▸ Без активности за период', '', ''])
    er.eachCell((c) => fill(c, GRAY, true))
    for (const c of data.chatsEmpty) {
      s1.addRow([`   ${c.title}`, '—', '—'])
    }
  }

  const f1 = s1.addRow(['ИТОГО ПО ВСЕМ', data.totals.handled, data.totals.unique])
  f1.eachCell((c) => fill(c, GREEN_FINAL, true))
  s1.columns.forEach((c) => (c.width = 30))

  // ── Лист 2: Teamly ──
  const s2 = wb.addWorksheet('Teamly')
  s2.addRow([`СБ — Teamly · ${period.sheetLabel} (${period.rangeLabel})`])
  s2.mergeCells('A1:D1')
  const head2 = s2.addRow(['Сотрудник', 'Создал карточек', 'Комментариев', 'Всего'])
  head2.eachCell((c) => fill(c, PURPLE, true))

  const firstDataRow = s2.rowCount + 1
  let rowIdx = firstDataRow
  for (const emp of data.employees) {
    const r = s2.addRow([
      emp.full_name,
      emp.teamly.created,
      emp.teamly.commented,
      { formula: `B${rowIdx}+C${rowIdx}` },
    ])
    fillTeamlyRow(r)
    rowIdx++
  }
  const lastDataRow = s2.rowCount
  const totalRow = s2.addRow([
    'ИТОГО',
    { formula: `SUM(B${firstDataRow}:B${lastDataRow})` },
    { formula: `SUM(C${firstDataRow}:C${lastDataRow})` },
    { formula: `SUM(D${firstDataRow}:D${lastDataRow})` },
  ])
  totalRow.eachCell((c) => fill(c, GREEN_FINAL, true))
  s2.columns.forEach((c) => (c.width = 24))

  // ── Лист 3: Итоги ──
  const s3 = wb.addWorksheet('Итоги')
  s3.addRow([`СБ — Итоги · ${period.sheetLabel}`])
  s3.mergeCells('A1:B1')
  s3.addRow(['Период', period.rangeLabel])
  s3.addRow(['Сотрудников в работе', data.employeeCount])
  const tgHead = s3.addRow(['Telegram', ''])
  fill(tgHead.getCell(1), PURPLE, true)
  s3.addRow(['Обработано триггеров', data.totals.handled])
  s3.addRow(['Уникальных триггеров', data.totals.unique])
  s3.addRow(['Активных trigger-чатов', data.activeChats])
  const tmHead = s3.addRow(['Teamly', ''])
  fill(tmHead.getCell(1), PURPLE, true)
  s3.addRow(['Создано карточек', data.totals.created])
  s3.addRow(['Комментариев', data.totals.commented])
  s3.getColumn(1).width = 28
  s3.getColumn(2).width = 26

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}

function fillTeamlyRow(row: ExcelJS.Row): void {
  for (const i of [2, 3, 4]) {
    row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_TM } }
  }
}

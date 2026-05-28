import { describe, it, expect } from 'vitest'
import { buildReportData } from '../../src/reports/aggregate.js'
import type { TelegramEventRow } from '../../src/database/queries/telegram-events.js'

const SB = 6300594719
const CHAT = -1001234
const D = new Date('2026-05-10T08:00:00Z')

function reply(id: number, trigId: number): TelegramEventRow {
  return { event_id: `r${id}`, employee_id: SB, chat_id: CHAT, event_type: 'trigger_reply', occurred_at: D, payload: { reply_to_message_id: trigId } }
}
function reaction(id: number, trigId: number): TelegramEventRow {
  return { event_id: `x${id}`, employee_id: SB, chat_id: CHAT, event_type: 'trigger_reaction', occurred_at: D, payload: { trigger_message_id: trigId } }
}

describe('buildReportData', () => {
  it('дедуп: ответ и реакция на один триггер → обработано 2, уникальных 1', () => {
    const data = buildReportData({
      telegram: [reply(1, 9), reaction(1, 9)],
      teamly: [{ employee_id: SB, event_type: 'article_create' }],
      employees: [{ telegram_id: SB, full_name: 'Ани', teamly_user_id: null, created_at: D }],
      chats: [{ chat_id: CHAT, title: 'Юрлица', added_at: D }],
    })
    const emp = data.employees[0]
    expect(emp.tg.handled).toBe(2)
    expect(emp.tg.unique).toBe(1)
    expect(emp.teamly.created).toBe(1)
    expect(emp.teamly.commented).toBe(0)
    expect(emp.perChat[0]).toMatchObject({ title: 'Юрлица', handled: 2, unique: 1 })
    expect(data.activeChats).toBe(1)
    expect(data.totals.handled).toBe(2)
  })

  it('игнорирует чаты не из trigger_chats', () => {
    const data = buildReportData({
      telegram: [{ ...reply(1, 9), chat_id: -999 }],
      teamly: [],
      employees: [{ telegram_id: SB, full_name: 'Ани', teamly_user_id: null, created_at: D }],
      chats: [{ chat_id: CHAT, title: 'Юрлица', added_at: D }],
    })
    expect(data.employees[0].perChat).toEqual([])
    expect(data.activeChats).toBe(0)
  })
})

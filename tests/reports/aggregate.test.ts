import { describe, it, expect } from 'vitest'
import { buildReportData } from '../../src/reports/aggregate.js'
import type { TelegramEventRow } from '../../src/database/queries/telegram-events.js'

const ANI = 6300594719
const SVETA = 7924502831
const CHAT = -1001234
const CHAT2 = -1005678
const CHAT_EMPTY = -1009999
const D = new Date('2026-05-10T08:00:00Z')

function reply(emp: number, chat: number, id: number, trigId: number): TelegramEventRow {
  return { event_id: `r${id}`, employee_id: emp, chat_id: chat, event_type: 'trigger_reply', occurred_at: D, payload: { reply_to_message_id: trigId } }
}
function reaction(emp: number, chat: number, id: number, trigId: number): TelegramEventRow {
  return { event_id: `x${id}`, employee_id: emp, chat_id: chat, event_type: 'trigger_reaction', occurred_at: D, payload: { trigger_message_id: trigId } }
}

describe('buildReportData', () => {
  it('дедуп: ответ и реакция на один триггер → обработано 2, уникальных 1', () => {
    const data = buildReportData({
      telegram: [reply(ANI, CHAT, 1, 9), reaction(ANI, CHAT, 1, 9)],
      teamly: [{ employee_id: ANI, event_type: 'article_create' }],
      employees: [{ telegram_id: ANI, full_name: 'Ани', teamly_user_id: null, created_at: D }],
      chats: [{ chat_id: CHAT, title: 'Юрлица', added_at: D }],
    })
    const emp = data.employees[0]
    expect(emp.tg.handled).toBe(2)
    expect(emp.tg.unique).toBe(1)
    expect(emp.teamly.created).toBe(1)
    expect(emp.teamly.commented).toBe(0)
    expect(data.chatsActive).toHaveLength(1)
    expect(data.chatsActive[0]).toMatchObject({ title: 'Юрлица', handled: 2, unique: 1 })
    expect(data.chatsActive[0].perEmployee[0]).toMatchObject({ full_name: 'Ани', handled: 2, unique: 1 })
    expect(data.chatsEmpty).toEqual([])
    expect(data.activeChats).toBe(1)
    expect(data.totals.handled).toBe(2)
  })

  it('игнорирует чаты не из trigger_chats', () => {
    const data = buildReportData({
      telegram: [{ ...reply(ANI, CHAT, 1, 9), chat_id: -999 }],
      teamly: [],
      employees: [{ telegram_id: ANI, full_name: 'Ани', teamly_user_id: null, created_at: D }],
      chats: [{ chat_id: CHAT, title: 'Юрлица', added_at: D }],
    })
    expect(data.chatsActive).toEqual([])
    expect(data.chatsEmpty).toEqual([{ chat_id: CHAT, title: 'Юрлица' }])
    expect(data.activeChats).toBe(0)
  })

  it('пустые чаты идут в chatsEmpty, активные в chatsActive (отсорт. по handled desc)', () => {
    const data = buildReportData({
      telegram: [
        reply(ANI, CHAT, 1, 9),
        reply(SVETA, CHAT2, 2, 10),
        reply(SVETA, CHAT2, 3, 11),
        reply(SVETA, CHAT2, 4, 12),
      ],
      teamly: [],
      employees: [
        { telegram_id: ANI, full_name: 'Ани', teamly_user_id: null, created_at: D },
        { telegram_id: SVETA, full_name: 'Света', teamly_user_id: null, created_at: D },
      ],
      chats: [
        { chat_id: CHAT, title: 'A', added_at: D },
        { chat_id: CHAT2, title: 'B', added_at: D },
        { chat_id: CHAT_EMPTY, title: 'Z пустой', added_at: D },
      ],
    })
    expect(data.chatsActive.map((c) => c.title)).toEqual(['B', 'A'])
    expect(data.chatsEmpty).toEqual([{ chat_id: CHAT_EMPTY, title: 'Z пустой' }])
    const b = data.chatsActive[0]
    expect(b.perEmployee).toEqual([
      { telegram_id: ANI, full_name: 'Ани', handled: 0, unique: 0 },
      { telegram_id: SVETA, full_name: 'Света', handled: 3, unique: 3 },
    ])
    expect(data.activeChats).toBe(2)
  })
})

import { describe, it, expect } from 'vitest'
import { uniqueTriggersByWeek } from '../../src/reports/aggregate.js'
import type { TelegramEventRow } from '../../src/database/queries/telegram-events.js'

const ANI = 6300594719
const SVETA = 7924502831
const CHAT = -1001234
// среда недели понедельника 2026-05-04 (МСК)
const W1 = new Date('2026-05-06T10:00:00.000Z')

function reply(emp: number, chat: number, id: string, trigId: unknown, when = W1): TelegramEventRow {
  return { event_id: `r${id}`, employee_id: emp, chat_id: chat, event_type: 'trigger_reply', occurred_at: when, payload: { reply_to_message_id: trigId } }
}
function reaction(emp: number, chat: number, id: string, trigId: unknown, when = W1): TelegramEventRow {
  return { event_id: `x${id}`, employee_id: emp, chat_id: chat, event_type: 'trigger_reaction', occurred_at: when, payload: { trigger_message_id: trigId } }
}

const EMP = new Set([ANI, SVETA])
const CHATS = new Set([CHAT])

describe('uniqueTriggersByWeek', () => {
  it('командный дедуп: один триггер у двух сотрудников → 1', () => {
    const rows = [reply(ANI, CHAT, '1', 9), reaction(SVETA, CHAT, '2', 9)]
    expect(uniqueTriggersByWeek(rows, EMP, CHATS)).toEqual({ '2026-05-04': 1 })
  })

  it('извлекает trigger_id для reply и reaction (разные триггеры → 2)', () => {
    const rows = [reply(ANI, CHAT, '1', 9), reaction(ANI, CHAT, '2', 10)]
    expect(uniqueTriggersByWeek(rows, EMP, CHATS)).toEqual({ '2026-05-04': 2 })
  })

  it('игнорирует строки без числового trigger_id', () => {
    const rows = [reply(ANI, CHAT, '1', undefined), reaction(ANI, CHAT, '2', '11')]
    expect(uniqueTriggersByWeek(rows, EMP, CHATS)).toEqual({})
  })

  it('игнорирует незарегистрированные чаты и сотрудников', () => {
    const rows = [
      reply(ANI, -999, '1', 9), // чужой чат
      reply(111111, CHAT, '2', 10), // не сотрудник СБ
    ]
    expect(uniqueTriggersByWeek(rows, EMP, CHATS)).toEqual({})
  })

  it('раскладывает по ISO-неделям (МСК), включая стык месяцев', () => {
    // пятница 2026-05-01 12:00 МСК → неделя понедельника 2026-04-27
    const apr = new Date('2026-05-01T09:00:00.000Z')
    const rows = [reply(ANI, CHAT, '1', 9, apr), reply(ANI, CHAT, '2', 10, W1)]
    expect(uniqueTriggersByWeek(rows, EMP, CHATS)).toEqual({
      '2026-04-27': 1,
      '2026-05-04': 1,
    })
  })
})

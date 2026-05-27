import { describe, it, expect } from 'vitest'
import { buildEvents, type EventInput } from '../../../src/sources/telegram/event-builder.js'

const SB_EMPLOYEE_ID = 6300594719
const OTHER_USER_ID = 1234567
const CHAT_ID = -1001234

describe('event-builder', () => {
  it('возвращает [] для сообщения от не-сотрудника СБ', () => {
    const input: EventInput = {
      kind: 'message',
      chatId: CHAT_ID,
      messageId: 10,
      fromId: OTHER_USER_ID,
      date: new Date('2026-05-27T10:00:00Z'),
      replyToMessageId: undefined,
      replyToUserId: undefined,
      text: 'hello',
    }
    expect(buildEvents(input, { isSbEmployee: () => false })).toEqual([])
  })

  it('строит message-event для сообщения сотрудника СБ без reply', () => {
    const input: EventInput = {
      kind: 'message',
      chatId: CHAT_ID,
      messageId: 10,
      fromId: SB_EMPLOYEE_ID,
      date: new Date('2026-05-27T10:00:00Z'),
      replyToMessageId: undefined,
      replyToUserId: undefined,
      text: 'hello',
    }
    const events = buildEvents(input, { isSbEmployee: (id) => id === SB_EMPLOYEE_ID })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      event_id: `tg:${CHAT_ID}:10:message`,
      employee_id: SB_EMPLOYEE_ID,
      chat_id: CHAT_ID,
      event_type: 'message',
    })
  })

  it('строит message + trigger_reply, если сотрудник СБ отвечает не-сотруднику', () => {
    const input: EventInput = {
      kind: 'message',
      chatId: CHAT_ID,
      messageId: 11,
      fromId: SB_EMPLOYEE_ID,
      date: new Date('2026-05-27T10:00:00Z'),
      replyToMessageId: 9,
      replyToUserId: OTHER_USER_ID,
      text: 'reply',
    }
    const events = buildEvents(input, { isSbEmployee: (id) => id === SB_EMPLOYEE_ID })
    const types = events.map((e) => e.event_type).sort()
    expect(types).toEqual(['message', 'trigger_reply'])
    const triggerReply = events.find((e) => e.event_type === 'trigger_reply')!
    expect(triggerReply.event_id).toBe(`tg:${CHAT_ID}:11:trigger_reply`)
    expect(triggerReply.payload).toMatchObject({ reply_to_message_id: 9 })
  })

  it('НЕ строит trigger_reply, если сотрудник СБ отвечает другому сотруднику СБ', () => {
    const ANOTHER_SB_ID = 7924502831
    const input: EventInput = {
      kind: 'message',
      chatId: CHAT_ID,
      messageId: 12,
      fromId: SB_EMPLOYEE_ID,
      date: new Date('2026-05-27T10:00:00Z'),
      replyToMessageId: 9,
      replyToUserId: ANOTHER_SB_ID,
      text: 'reply',
    }
    const events = buildEvents(input, {
      isSbEmployee: (id) => id === SB_EMPLOYEE_ID || id === ANOTHER_SB_ID,
    })
    expect(events.map((e) => e.event_type)).toEqual(['message'])
  })

  it('строит reaction-event для эмодзи-реакции сотрудника СБ', () => {
    const input: EventInput = {
      kind: 'reaction',
      chatId: CHAT_ID,
      messageId: 20,
      fromId: SB_EMPLOYEE_ID,
      date: new Date('2026-05-27T10:00:00Z'),
      emoji: '👍',
    }
    const events = buildEvents(input, { isSbEmployee: () => true })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      event_id: `tg:${CHAT_ID}:20:reaction:${SB_EMPLOYEE_ID}:👍`,
      event_type: 'reaction',
      payload: { emoji: '👍' },
    })
  })
})

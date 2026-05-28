import { describe, it, expect } from 'vitest'
import { buildIntents, type EventInput } from '../../../src/sources/telegram/event-builder.js'

const SB = 6300594719
const SB2 = 7924502831
const EXT = 1234567
const CHAT = -1001234
const D = new Date('2026-05-27T10:00:00Z')
const isSb = (id: number) => id === SB || id === SB2

describe('buildIntents', () => {
  it('внешнее сообщение → trigger_message', () => {
    const input: EventInput = { kind: 'message', chatId: CHAT, messageId: 10, fromId: EXT, date: D, replyToMessageId: undefined, replyToUserId: undefined, text: 'hi' }
    expect(buildIntents(input, { isSbEmployee: isSb })).toEqual([
      { kind: 'trigger_message', chatId: CHAT, messageId: 10, authorId: EXT, date: D },
    ])
  })

  it('обычное сообщение сотрудника (не reply) → []', () => {
    const input: EventInput = { kind: 'message', chatId: CHAT, messageId: 10, fromId: SB, date: D, replyToMessageId: undefined, replyToUserId: undefined, text: 'hi' }
    expect(buildIntents(input, { isSbEmployee: isSb })).toEqual([])
  })

  it('reply сотрудника на внешнее → trigger_message(внешнего) + trigger_reply', () => {
    const input: EventInput = { kind: 'message', chatId: CHAT, messageId: 11, fromId: SB, date: D, replyToMessageId: 9, replyToUserId: EXT, text: 'r' }
    const out = buildIntents(input, { isSbEmployee: isSb })
    expect(out).toContainEqual({ kind: 'trigger_message', chatId: CHAT, messageId: 9, authorId: EXT, date: D })
    expect(out).toContainEqual({ kind: 'trigger_reply', chatId: CHAT, messageId: 11, fromId: SB, replyToMessageId: 9, replyToUserId: EXT, date: D })
  })

  it('reply сотрудника на сотрудника → []', () => {
    const input: EventInput = { kind: 'message', chatId: CHAT, messageId: 12, fromId: SB, date: D, replyToMessageId: 9, replyToUserId: SB2, text: 'r' }
    expect(buildIntents(input, { isSbEmployee: isSb })).toEqual([])
  })

  it('реакция сотрудника → reaction_candidate', () => {
    const input: EventInput = { kind: 'reaction', chatId: CHAT, messageId: 20, fromId: SB, date: D, emoji: '👍' }
    expect(buildIntents(input, { isSbEmployee: isSb })).toEqual([
      { kind: 'reaction_candidate', chatId: CHAT, messageId: 20, fromId: SB, emoji: '👍', date: D },
    ])
  })

  it('реакция не-сотрудника → []', () => {
    const input: EventInput = { kind: 'reaction', chatId: CHAT, messageId: 20, fromId: EXT, date: D, emoji: '👍' }
    expect(buildIntents(input, { isSbEmployee: isSb })).toEqual([])
  })
})

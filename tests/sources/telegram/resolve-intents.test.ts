import { describe, it, expect } from 'vitest'
import { resolveIntents, type EventIntent } from '../../../src/sources/telegram/event-builder.js'

const CHAT = -1001234
const SB = 6300594719
const EXT = 1234567
const D = new Date('2026-05-27T10:00:00Z')

describe('resolveIntents', () => {
  it('trigger_message → строка trigger_messages', async () => {
    const intents: EventIntent[] = [{ kind: 'trigger_message', chatId: CHAT, messageId: 9, authorId: EXT, date: D }]
    const out = await resolveIntents(intents, { findTriggerMessage: async () => null })
    expect(out.triggerMessages).toEqual([{ chat_id: CHAT, message_id: 9, author_id: EXT, occurred_at: D }])
    expect(out.events).toEqual([])
  })

  it('trigger_reply → событие trigger_reply', async () => {
    const intents: EventIntent[] = [{ kind: 'trigger_reply', chatId: CHAT, messageId: 11, fromId: SB, replyToMessageId: 9, replyToUserId: EXT, date: D }]
    const out = await resolveIntents(intents, { findTriggerMessage: async () => null })
    expect(out.events).toHaveLength(1)
    expect(out.events[0]).toMatchObject({
      event_id: `tg:${CHAT}:11:trigger_reply`,
      employee_id: SB,
      chat_id: CHAT,
      event_type: 'trigger_reply',
      payload: { reply_to_message_id: 9, reply_to_user_id: EXT },
    })
  })

  it('reaction_candidate + матч → событие trigger_reaction', async () => {
    const intents: EventIntent[] = [{ kind: 'reaction_candidate', chatId: CHAT, messageId: 9, fromId: SB, emoji: '👍', date: D }]
    const out = await resolveIntents(intents, { findTriggerMessage: async () => ({ author_id: EXT }) })
    expect(out.events).toHaveLength(1)
    expect(out.events[0]).toMatchObject({
      event_id: `tg:${CHAT}:9:trigger_reaction:${SB}:👍`,
      employee_id: SB,
      event_type: 'trigger_reaction',
      payload: { trigger_message_id: 9, author_id: EXT },
    })
  })

  it('reaction_candidate без матча → ничего', async () => {
    const intents: EventIntent[] = [{ kind: 'reaction_candidate', chatId: CHAT, messageId: 9, fromId: SB, emoji: '👍', date: D }]
    const out = await resolveIntents(intents, { findTriggerMessage: async () => null })
    expect(out.events).toEqual([])
  })

  it('reaction_candidate без матча → вызывает onReactionDropped (чтобы потеря была видна в логах)', async () => {
    const dropped: Array<{ chatId: number; messageId: number; fromId: number; emoji: string }> = []
    const intents: EventIntent[] = [{ kind: 'reaction_candidate', chatId: CHAT, messageId: 9, fromId: SB, emoji: '👀', date: D }]
    const out = await resolveIntents(intents, {
      findTriggerMessage: async () => null,
      onReactionDropped: (i) => dropped.push({ chatId: i.chatId, messageId: i.messageId, fromId: i.fromId, emoji: i.emoji }),
    })
    expect(out.events).toEqual([])
    expect(dropped).toEqual([{ chatId: CHAT, messageId: 9, fromId: SB, emoji: '👀' }])
  })

  it('reaction_candidate с матчем → onReactionDropped НЕ вызывается', async () => {
    const dropped: unknown[] = []
    const intents: EventIntent[] = [{ kind: 'reaction_candidate', chatId: CHAT, messageId: 9, fromId: SB, emoji: '👀', date: D }]
    await resolveIntents(intents, {
      findTriggerMessage: async () => ({ author_id: EXT }),
      onReactionDropped: (i) => dropped.push(i),
    })
    expect(dropped).toEqual([])
  })
})

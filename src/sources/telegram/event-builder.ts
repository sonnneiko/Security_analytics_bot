import type { TelegramEventRow } from '../../database/queries/telegram-events.js'
import type { TriggerMessageRow } from '../../database/queries/trigger-messages.js'

export type EventInput =
  | {
      kind: 'message'
      chatId: number
      messageId: number
      fromId: number
      date: Date
      replyToMessageId: number | undefined
      replyToUserId: number | undefined
      text: string | undefined
    }
  | {
      kind: 'reaction'
      chatId: number
      messageId: number
      fromId: number
      date: Date
      emoji: string
    }

export type EventIntent =
  | { kind: 'trigger_message'; chatId: number; messageId: number; authorId: number; date: Date }
  | {
      kind: 'trigger_reply'
      chatId: number
      messageId: number
      fromId: number
      replyToMessageId: number
      replyToUserId: number
      date: Date
    }
  | { kind: 'reaction_candidate'; chatId: number; messageId: number; fromId: number; emoji: string; date: Date }

export interface BuildDeps {
  isSbEmployee: (telegramId: number) => boolean
}

export function buildIntents(input: EventInput, deps: BuildDeps): EventIntent[] {
  if (input.kind === 'reaction') {
    if (!deps.isSbEmployee(input.fromId)) return []
    return [
      { kind: 'reaction_candidate', chatId: input.chatId, messageId: input.messageId, fromId: input.fromId, emoji: input.emoji, date: input.date },
    ]
  }

  // kind === 'message'
  if (!deps.isSbEmployee(input.fromId)) {
    // внешнее сообщение — потенциальный триггер
    return [{ kind: 'trigger_message', chatId: input.chatId, messageId: input.messageId, authorId: input.fromId, date: input.date }]
  }

  // сообщение сотрудника: считаем только reply на внешнее
  const isTriggerReply =
    input.replyToMessageId !== undefined &&
    input.replyToUserId !== undefined &&
    !deps.isSbEmployee(input.replyToUserId)
  if (!isTriggerReply) return []

  return [
    { kind: 'trigger_message', chatId: input.chatId, messageId: input.replyToMessageId!, authorId: input.replyToUserId!, date: input.date },
    { kind: 'trigger_reply', chatId: input.chatId, messageId: input.messageId, fromId: input.fromId, replyToMessageId: input.replyToMessageId!, replyToUserId: input.replyToUserId!, date: input.date },
  ]
}

export interface ResolveDeps {
  findTriggerMessage: (chatId: number, messageId: number) => Promise<{ author_id: number } | null>
}

export async function resolveIntents(
  intents: EventIntent[],
  deps: ResolveDeps,
): Promise<{ triggerMessages: TriggerMessageRow[]; events: TelegramEventRow[] }> {
  const triggerMessages: TriggerMessageRow[] = []
  const events: TelegramEventRow[] = []

  for (const intent of intents) {
    if (intent.kind === 'trigger_message') {
      triggerMessages.push({ chat_id: intent.chatId, message_id: intent.messageId, author_id: intent.authorId, occurred_at: intent.date })
    } else if (intent.kind === 'trigger_reply') {
      events.push({
        event_id: `tg:${intent.chatId}:${intent.messageId}:trigger_reply`,
        employee_id: intent.fromId,
        chat_id: intent.chatId,
        event_type: 'trigger_reply',
        occurred_at: intent.date,
        payload: { reply_to_message_id: intent.replyToMessageId, reply_to_user_id: intent.replyToUserId },
      })
    } else {
      const trig = await deps.findTriggerMessage(intent.chatId, intent.messageId)
      if (!trig) continue
      events.push({
        event_id: `tg:${intent.chatId}:${intent.messageId}:trigger_reaction:${intent.fromId}:${intent.emoji}`,
        employee_id: intent.fromId,
        chat_id: intent.chatId,
        event_type: 'trigger_reaction',
        occurred_at: intent.date,
        payload: { trigger_message_id: intent.messageId, author_id: trig.author_id },
      })
    }
  }
  return { triggerMessages, events }
}

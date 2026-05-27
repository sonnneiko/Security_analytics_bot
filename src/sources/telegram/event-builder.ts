import type { TelegramEventRow } from '../../database/queries/telegram-events.js'

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

export interface EventBuilderDeps {
  isSbEmployee: (telegramId: number) => boolean
}

export function buildEvents(input: EventInput, deps: EventBuilderDeps): TelegramEventRow[] {
  if (!deps.isSbEmployee(input.fromId)) return []

  if (input.kind === 'reaction') {
    return [
      {
        event_id: `tg:${input.chatId}:${input.messageId}:reaction:${input.fromId}:${input.emoji}`,
        employee_id: input.fromId,
        chat_id: input.chatId,
        event_type: 'reaction',
        occurred_at: input.date,
        payload: { emoji: input.emoji, target_message_id: input.messageId },
      },
    ]
  }

  const events: TelegramEventRow[] = [
    {
      event_id: `tg:${input.chatId}:${input.messageId}:message`,
      employee_id: input.fromId,
      chat_id: input.chatId,
      event_type: 'message',
      occurred_at: input.date,
      payload: { text: input.text ?? '' },
    },
  ]

  const isTriggerReply =
    input.replyToMessageId !== undefined &&
    input.replyToUserId !== undefined &&
    !deps.isSbEmployee(input.replyToUserId)

  if (isTriggerReply) {
    events.push({
      event_id: `tg:${input.chatId}:${input.messageId}:trigger_reply`,
      employee_id: input.fromId,
      chat_id: input.chatId,
      event_type: 'trigger_reply',
      occurred_at: input.date,
      payload: {
        reply_to_message_id: input.replyToMessageId,
        reply_to_user_id: input.replyToUserId,
      },
    })
  }

  return events
}

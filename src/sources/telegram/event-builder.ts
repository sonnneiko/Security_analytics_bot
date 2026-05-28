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

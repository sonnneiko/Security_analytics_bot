import type { Driver } from 'ydb-sdk'
import { logger } from '../../logger.js'
import type { DataSource } from '../types.js'
import { insertEvent } from '../../database/queries/telegram-events.js'
import { upsertTriggerMessage, findTriggerMessage } from '../../database/queries/trigger-messages.js'
import { buildIntents, resolveIntents, type EventInput } from './event-builder.js'

export class TelegramSource implements DataSource {
  readonly name = 'telegram' as const

  constructor(
    private readonly driver: Driver,
    private readonly deps: {
      isSbEmployee: (id: number) => boolean
      isTriggerChat: (chatId: number) => Promise<boolean>
    },
  ) {}

  async init(): Promise<void> {}

  async handleIncomingEvent(input: EventInput): Promise<void> {
    const inTriggerChat = await this.deps.isTriggerChat(input.chatId)
    if (!inTriggerChat) return

    const intents = buildIntents(input, { isSbEmployee: this.deps.isSbEmployee })
    if (intents.length === 0) return

    const { triggerMessages, events } = await resolveIntents(intents, {
      findTriggerMessage: (chatId, messageId) => findTriggerMessage(this.driver, chatId, messageId),
      onReactionDropped: (i) =>
        logger.warn(
          { chat: i.chatId, message: i.messageId, employee: i.fromId, emoji: i.emoji },
          'reaction dropped: trigger message not recorded (likely posted while bot was down)',
        ),
    })

    for (const tm of triggerMessages) {
      try {
        await upsertTriggerMessage(this.driver, tm)
      } catch (err) {
        logger.error({ err, tm }, 'failed to upsert trigger message')
      }
    }
    for (const ev of events) {
      try {
        await insertEvent(this.driver, ev)
        logger.debug({ event: ev.event_type, employee: ev.employee_id, chat: ev.chat_id }, 'telegram event saved')
      } catch (err) {
        logger.error({ err, event: ev }, 'failed to insert telegram event')
      }
    }
  }
}

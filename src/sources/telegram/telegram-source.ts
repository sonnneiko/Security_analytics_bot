import { Driver } from 'ydb-sdk'
import { logger } from '../../logger.js'
import type { DataSource } from '../types.js'
import { insertEvent } from '../../database/queries/telegram-events.js'
import { buildEvents, type EventInput } from './event-builder.js'

export class TelegramSource implements DataSource {
  readonly name = 'telegram' as const

  constructor(
    private readonly driver: Driver,
    private readonly deps: {
      isSbEmployee: (id: number) => boolean
      isTriggerChat: (chatId: number) => Promise<boolean>
    },
  ) {}

  async init(): Promise<void> {
    // ничего инициализировать не нужно: driver уже готов
  }

  async handleIncomingEvent(input: EventInput): Promise<void> {
    const inTriggerChat = await this.deps.isTriggerChat(input.chatId)
    if (!inTriggerChat) return

    const events = buildEvents(input, { isSbEmployee: this.deps.isSbEmployee })
    for (const ev of events) {
      try {
        await insertEvent(this.driver, ev)
        logger.debug(
          { event: ev.event_type, employee: ev.employee_id, chat: ev.chat_id },
          'telegram event saved',
        )
      } catch (err) {
        logger.error({ err, event: ev }, 'failed to insert telegram event')
      }
    }
  }
}

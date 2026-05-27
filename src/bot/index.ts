import { Bot } from 'grammy'
import { logger } from '../logger.js'
import type { AppContext, AppDeps } from './context.js'
import { registerWelcome } from './features/welcome.js'
import { registerAccess } from './features/access.js'
import { registerSbManagement } from './features/sb-management.js'
import { registerTriggerChatManagement } from './features/trigger-chat-management.js'
import { registerReport } from './features/report.js'
import { registerStatsCollector } from './features/stats-collector.js'

export function createBot(token: string, deps: AppDeps): Bot<AppContext> {
  const bot = new Bot<AppContext>(token)

  // прокинуть deps в каждый ctx
  bot.use((ctx, next) => {
    ;(ctx as AppContext).deps = deps
    return next()
  })

  // debug: лог входящих update'ов (видно при LOG_LEVEL=debug)
  bot.use((ctx, next) => {
    const update = ctx.update
    const kind = Object.keys(update).filter((k) => k !== 'update_id')
    logger.debug({ update_id: update.update_id, kind, chat_id: ctx.chat?.id }, 'incoming update')
    if (update.message_reaction) {
      logger.debug({ reaction: update.message_reaction }, 'message_reaction payload')
    }
    if (update.message) {
      logger.debug(
        {
          from: update.message.from,
          text: update.message.text,
          message_id: update.message.message_id,
          has_reply: Boolean(update.message.reply_to_message),
          service: Object.keys(update.message).filter((k) =>
            ['new_chat_members', 'left_chat_member', 'pinned_message', 'new_chat_title'].includes(k),
          ),
        },
        'message payload',
      )
    }
    return next()
  })

  // ВАЖНО: stats-collector ПЕРЕД access — иначе deny-handler съест событие
  registerStatsCollector(bot)

  registerWelcome(bot)
  registerSbManagement(bot)
  registerTriggerChatManagement(bot)
  registerReport(bot)

  // deny-handler в самом конце, ловит всё, что не обработано в ЛС
  registerAccess(bot)

  return bot
}

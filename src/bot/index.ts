import { Bot } from 'grammy'
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

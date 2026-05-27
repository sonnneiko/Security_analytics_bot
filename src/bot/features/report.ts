import type { Bot } from 'grammy'
import type { AppContext } from '../context.js'
import { hasBotAccess } from '../filters.js'

export function registerReport(bot: Bot<AppContext>): void {
  bot.command('report', async (ctx) => {
    if (!hasBotAccess(ctx)) return
    await ctx.reply(
      'Отчёт пока не готов — собираем события из триггерных чатов. ' +
        'Excel-сборка появится в следующей версии.',
    )
  })
}

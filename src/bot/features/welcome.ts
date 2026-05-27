import type { Bot } from 'grammy'
import type { AppContext } from '../context.js'
import { hasBotAccess } from '../filters.js'

export function registerWelcome(bot: Bot<AppContext>): void {
  bot.command('start', async (ctx) => {
    if (!ctx.chat || ctx.chat.type !== 'private') return
    if (!hasBotAccess(ctx)) return // обработает registerAccess
    const name = ctx.from?.first_name ?? 'коллега'
    await ctx.reply(
      `Привет, ${name}! Я бот статистики СБ.\n\n` +
        `Команды:\n` +
        `/report month — отчёт за месяц (пока заглушка)\n` +
        `/list_sb — список сотрудников\n` +
        `/list_trigger_chats — список trigger-чатов`,
    )
  })
}

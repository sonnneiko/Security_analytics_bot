import type { Bot } from 'grammy'
import type { AppContext } from '../context.js'
import { hasBotAccess } from '../filters.js'

const denyMessage = (id: number) =>
  `Нет доступа. Ваш Telegram ID: ${id}\n\n` +
  `Если это ошибка, напишите @Alhazova_UnitPay.`

export function registerAccess(bot: Bot<AppContext>): void {
  // Только в ЛС: незарегистрированные получают свой telegram_id
  bot.chatType('private').on('message', async (ctx) => {
    if (hasBotAccess(ctx)) return
    if (ctx.from) await ctx.reply(denyMessage(ctx.from.id))
  })
}

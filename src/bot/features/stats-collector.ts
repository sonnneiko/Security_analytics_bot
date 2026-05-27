import type { Bot } from 'grammy'
import type { AppContext } from '../context.js'
import type { EventInput } from '../../sources/telegram/event-builder.js'

export function registerStatsCollector(bot: Bot<AppContext>): void {
  // обычные сообщения в групп-чатах
  bot.on('message', async (ctx, next) => {
    if (!ctx.chat || ctx.chat.type === 'private') return next()
    if (!ctx.from) return next()

    const reply = ctx.message.reply_to_message
    const input: EventInput = {
      kind: 'message',
      chatId: ctx.chat.id,
      messageId: ctx.message.message_id,
      fromId: ctx.from.id,
      date: new Date(ctx.message.date * 1000),
      replyToMessageId: reply?.message_id,
      replyToUserId: reply?.from?.id,
      text: ctx.message.text,
    }

    await ctx.deps.telegramSource.handleIncomingEvent(input)
    return next()
  })

  // эмодзи-реакции
  bot.on('message_reaction', async (ctx, next) => {
    if (!ctx.chat || !ctx.messageReaction) return next()
    const r = ctx.messageReaction
    const userId = r.user?.id
    if (!userId) return next()

    // считаем только «появившиеся» эмодзи (new_reaction), игнорируем снятые
    for (const reaction of r.new_reaction) {
      if (reaction.type !== 'emoji') continue
      await ctx.deps.telegramSource.handleIncomingEvent({
        kind: 'reaction',
        chatId: ctx.chat.id,
        messageId: r.message_id,
        fromId: userId,
        date: new Date(r.date * 1000),
        emoji: reaction.emoji,
      })
    }
    return next()
  })
}

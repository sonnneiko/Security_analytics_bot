import type { Bot } from 'grammy'
import type { Message } from 'grammy/types'
import type { AppContext } from '../context.js'
import type { EventInput } from '../../sources/telegram/event-builder.js'

// Service-сообщения (добавление/удаление участников, пин, смена title и т.д.)
// прилетают как обычный `message` update, но не являются пользовательским контентом.
// Они не должны попадать в статистику.
function isServiceMessage(msg: Message): boolean {
  return Boolean(
    msg.new_chat_members ||
      msg.left_chat_member ||
      msg.pinned_message ||
      msg.new_chat_title ||
      msg.new_chat_photo ||
      msg.delete_chat_photo ||
      msg.group_chat_created ||
      msg.supergroup_chat_created ||
      msg.channel_chat_created ||
      msg.migrate_to_chat_id ||
      msg.migrate_from_chat_id ||
      msg.message_auto_delete_timer_changed ||
      msg.video_chat_started ||
      msg.video_chat_ended ||
      msg.video_chat_participants_invited ||
      msg.video_chat_scheduled ||
      msg.forum_topic_created ||
      msg.forum_topic_closed ||
      msg.forum_topic_reopened ||
      msg.forum_topic_edited ||
      msg.general_forum_topic_hidden ||
      msg.general_forum_topic_unhidden ||
      msg.boost_added ||
      msg.users_shared ||
      msg.chat_shared,
  )
}

export function registerStatsCollector(bot: Bot<AppContext>): void {
  // обычные сообщения в групп-чатах
  bot.on('message', async (ctx, next) => {
    if (!ctx.chat || ctx.chat.type === 'private') return next()
    if (!ctx.from) return next()
    if (isServiceMessage(ctx.message)) return next()

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

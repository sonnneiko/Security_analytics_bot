import type { Bot } from 'grammy'
import type { AppContext } from '../context.js'
import { hasBotAccess } from '../filters.js'
import {
  upsertTriggerChat,
  removeTriggerChat,
  listTriggerChats,
} from '../../database/queries/trigger-chats.js'

export function registerTriggerChatManagement(bot: Bot<AppContext>): void {
  bot.command('add_trigger_chat', async (ctx) => {
    if (!hasBotAccess(ctx)) return
    const arg = (ctx.match ?? '').toString().trim()
    let chatId: number
    let title: string
    if (arg) {
      const parsed = Number(arg)
      if (!Number.isFinite(parsed)) {
        await ctx.reply(
          'Использование: /add_trigger_chat — текущий чат, либо /add_trigger_chat <chat_id>',
        )
        return
      }
      chatId = parsed
      title = `chat_${parsed}`
    } else {
      if (!ctx.chat) return
      chatId = ctx.chat.id
      title = 'title' in ctx.chat && ctx.chat.title ? ctx.chat.title : `chat_${ctx.chat.id}`
    }
    await upsertTriggerChat(ctx.deps.driver, { chat_id: chatId, title })
    await ctx.reply(`Trigger-чат добавлен: ${title} (id:${chatId})`)
  })

  bot.command('remove_trigger_chat', async (ctx) => {
    if (!hasBotAccess(ctx)) return
    const arg = (ctx.match ?? '').toString().trim()
    const chatId = arg ? Number(arg) : ctx.chat ? ctx.chat.id : null
    if (chatId === null || !Number.isFinite(chatId)) {
      await ctx.reply('Использование: /remove_trigger_chat [chat_id]')
      return
    }
    await removeTriggerChat(ctx.deps.driver, chatId)
    await ctx.reply(`Trigger-чат удалён: id:${chatId}`)
  })

  bot.command('list_trigger_chats', async (ctx) => {
    if (!hasBotAccess(ctx)) return
    const rows = await listTriggerChats(ctx.deps.driver)
    if (rows.length === 0) {
      await ctx.reply('Trigger-чатов нет.')
      return
    }
    const lines = rows.map((r) => `• ${r.title} (id:${r.chat_id})`)
    await ctx.reply(`Trigger-чаты:\n${lines.join('\n')}`)
  })
}

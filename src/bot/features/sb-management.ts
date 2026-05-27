import type { Bot } from 'grammy'
import type { AppContext } from '../context.js'
import { hasBotAccess } from '../filters.js'
import {
  upsertEmployee,
  removeEmployee,
  listEmployees,
} from '../../database/queries/employees.js'

export function registerSbManagement(bot: Bot<AppContext>): void {
  bot.command('add_sb', async (ctx) => {
    if (!hasBotAccess(ctx)) return
    const args = (ctx.match ?? '').toString().trim().split(/\s+/).filter(Boolean)
    if (args.length < 2) {
      await ctx.reply('Использование: /add_sb <telegram_id> <ФИО> [teamly_user_id]')
      return
    }
    const tgId = Number(args[0])
    if (!Number.isFinite(tgId) || tgId <= 0) {
      await ctx.reply('telegram_id должен быть положительным числом')
      return
    }
    const rest = args.slice(1)
    let teamlyId: string | undefined
    const last = rest[rest.length - 1]
    if (last && /^[a-f0-9-]{8,}$/i.test(last)) {
      teamlyId = last
      rest.pop()
    }
    const fullName = rest.join(' ').trim()
    if (!fullName) {
      await ctx.reply('Не указано ФИО')
      return
    }
    await upsertEmployee(ctx.deps.driver, {
      telegram_id: tgId,
      full_name: fullName,
      teamly_user_id: teamlyId ?? null,
    })
    ctx.deps.sbEmployeeIds.add(tgId)
    await ctx.reply(
      `Добавлен: ${fullName} (tg:${tgId}${teamlyId ? `, teamly:${teamlyId}` : ''})`,
    )
  })

  bot.command('remove_sb', async (ctx) => {
    if (!hasBotAccess(ctx)) return
    const tgId = Number((ctx.match ?? '').toString().trim())
    if (!Number.isFinite(tgId) || tgId <= 0) {
      await ctx.reply('Использование: /remove_sb <telegram_id>')
      return
    }
    await removeEmployee(ctx.deps.driver, tgId)
    ctx.deps.sbEmployeeIds.delete(tgId)
    await ctx.reply(`Удалён: tg:${tgId}`)
  })

  bot.command('list_sb', async (ctx) => {
    if (!hasBotAccess(ctx)) return
    const rows = await listEmployees(ctx.deps.driver)
    if (rows.length === 0) {
      await ctx.reply('Список пуст.')
      return
    }
    const lines = rows.map(
      (r) =>
        `• ${r.full_name} (tg:${r.telegram_id}${r.teamly_user_id ? `, teamly:${r.teamly_user_id}` : ''})`,
    )
    await ctx.reply(`Сотрудники СБ:\n${lines.join('\n')}`)
  })
}

import { Bot, InputFile } from 'grammy'
import type { AppContext } from '../context.js'
import { hasBotAccess } from '../filters.js'
import { resolvePeriod } from '../../reports/period.js'
import { buildReportData } from '../../reports/aggregate.js'
import { buildWorkbook } from '../../reports/builder.js'
import { selectEventsForPeriod as selectTg } from '../../database/queries/telegram-events.js'
import { selectEventsForPeriod as selectTm } from '../../database/queries/teamly-events.js'
import { listEmployees } from '../../database/queries/employees.js'
import { listTriggerChats } from '../../database/queries/trigger-chats.js'
import { logger } from '../../logger.js'

export function registerReport(bot: Bot<AppContext>): void {
  bot.command('report', async (ctx) => {
    if (!hasBotAccess(ctx)) return

    const parts = (ctx.match ?? '').trim().split(/\s+/).filter(Boolean)
    const kind = parts[0] === 'week' ? 'week' : 'month' // дефолт — месяц
    const arg = parts[1]

    let period
    try {
      period = resolvePeriod(kind, arg)
    } catch (err) {
      await ctx.reply(`Не понял период. ${(err as Error).message}\nПример: /report month 2026-05 или /report week 2026-W21`)
      return
    }

    try {
      const driver = ctx.deps.driver
      const [telegram, teamly, employees, chats] = await Promise.all([
        selectTg(driver, period.from, period.to),
        selectTm(driver, period.from, period.to),
        listEmployees(driver),
        listTriggerChats(driver),
      ])
      const data = buildReportData({ telegram, teamly, employees, chats })
      const buf = await buildWorkbook(data, period)
      await ctx.replyWithDocument(new InputFile(buf, period.fileName), {
        caption: `СБ — отчёт · ${period.sheetLabel}`,
      })
    } catch (err) {
      logger.error({ err }, 'report build failed')
      await ctx.reply('Не удалось собрать отчёт. Попробуйте позже.')
    }
  })
}

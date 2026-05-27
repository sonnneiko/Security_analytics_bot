import { config } from './config.js'
import { logger } from './logger.js'
import { getDriver, closeDriver } from './database/client.js'
import { runMigrations } from './database/migrations.js'
import { upsertEmployee, listEmployees, isEmployee } from './database/queries/employees.js'
import { isTriggerChat } from './database/queries/trigger-chats.js'
import { TelegramSource } from './sources/telegram/telegram-source.js'
import { createBot } from './bot/index.js'
import type { AppDeps } from './bot/context.js'

async function main() {
  logger.info('starting security-analytics-bot')

  const driver = await getDriver()
  await runMigrations(driver)

  // bootstrap INITIAL_SB_USERS — добавляем недостающих
  for (const emp of config.sbEmployees) {
    const exists = await isEmployee(driver, emp.telegram_id)
    if (!exists) {
      await upsertEmployee(driver, {
        telegram_id: emp.telegram_id,
        full_name: emp.name,
        teamly_user_id: emp.teamly_user_id ?? null,
      })
      logger.info({ telegram_id: emp.telegram_id, name: emp.name }, 'bootstrapped sb employee')
    }
  }

  // снапшот sb_employees в память для горячего пути
  const rows = await listEmployees(driver)
  const sbEmployeeIds = new Set(rows.map((r) => r.telegram_id))
  const botAdminIds = new Set(config.botAdmins)

  const telegramSource = new TelegramSource(driver, {
    isSbEmployee: (id) => sbEmployeeIds.has(id),
    isTriggerChat: (chatId) => isTriggerChat(driver, chatId),
  })
  await telegramSource.init()

  const deps: AppDeps = { driver, telegramSource, sbEmployeeIds, botAdminIds }
  const bot = createBot(config.botToken, deps)

  bot.catch((err) => logger.error({ err }, 'bot error'))

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down')
    await bot.stop()
    await closeDriver()
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  await bot.start({
    allowed_updates: ['message', 'message_reaction', 'callback_query'],
    onStart: (info) =>
      logger.info({ bot: info.username, sb: sbEmployeeIds.size }, 'bot started'),
  })
}

main().catch((err) => {
  logger.error({ err }, 'fatal')
  process.exit(1)
})

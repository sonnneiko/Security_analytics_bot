import { run, type RunnerHandle } from '@grammyjs/runner'
import { config } from './config.js'
import { logger } from './logger.js'
import { getDriver, closeDriver } from './database/client.js'
import { runMigrations } from './database/migrations.js'
import { upsertEmployee, listEmployees, isEmployee } from './database/queries/employees.js'
import { isTriggerChat } from './database/queries/trigger-chats.js'
import { getToken, saveToken } from './database/queries/teamly-tokens.js'
import { TelegramSource } from './sources/telegram/telegram-source.js'
import { TeamlyApi, type TokenStore } from './sources/teamly/teamly-api.js'
import { TeamlySource } from './sources/teamly/teamly-source.js'
import { startServer } from './server/index.js'
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

  const teamlySource = await initTeamlySource(driver, rows)

  const server = startServer({
    port: config.serverPort,
    teamlyWebhookSecret: teamlySource ? config.teamlyWebhookSecret ?? null : null,
    teamlySource,
  })

  const deps: AppDeps = { driver, telegramSource, sbEmployeeIds, botAdminIds }
  const bot = createBot(config.botToken, deps)

  bot.catch((err) => logger.error({ err }, 'bot error'))

  let runner: RunnerHandle | undefined

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down')
    await server.close().catch((err) => logger.error({ err }, 'server close failed'))
    if (runner?.isRunning()) await runner.stop()
    await closeDriver()
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  // grammy runner вместо bot.start(): устойчивый long-polling, который сам
  // переживает сетевые ошибки getUpdates и не «глохнет» молча (как в work_analyst).
  await bot.init()
  runner = run(bot, {
    runner: { fetch: { allowed_updates: ['message', 'message_reaction', 'callback_query'] } },
  })
  logger.info({ bot: bot.botInfo.username, sb: sbEmployeeIds.size }, 'bot started')

  // если polling всё же падает — валим процесс, systemd поднимет заново
  // (вместо «процесс жив, но бот глухой на сутки»)
  void runner.task()?.catch((err) => {
    logger.fatal({ err }, 'polling runner crashed — exiting for restart')
    process.exit(1)
  })
}

async function initTeamlySource(
  driver: Awaited<ReturnType<typeof getDriver>>,
  employees: Awaited<ReturnType<typeof listEmployees>>,
): Promise<TeamlySource | null> {
  const cfgComplete =
    config.teamlySlug &&
    config.teamlyClientId &&
    config.teamlyClientSecret &&
    config.teamlyRedirectUri
  if (!cfgComplete) {
    logger.info('teamly config absent — source disabled')
    return null
  }

  const tokenStore: TokenStore = {
    get: () => getToken(driver),
    save: (row) => saveToken(driver, row),
  }
  const api = new TeamlyApi(
    {
      slug: config.teamlySlug!,
      clientId: config.teamlyClientId!,
      clientSecret: config.teamlyClientSecret!,
      redirectUri: config.teamlyRedirectUri!,
    },
    tokenStore,
  )

  const existing = await getToken(driver)
  if (existing) {
    logger.info('teamly tokens loaded from db')
  } else if (config.teamlyAuthCode) {
    try {
      await api.exchangeCode(config.teamlyAuthCode)
      logger.info('teamly auth bootstrapped')
    } catch (err) {
      logger.error({ err }, 'teamly bootstrap failed: integration disabled')
      return null
    }
  } else {
    logger.warn('teamly disabled: no tokens and no TEAMLY_AUTH_CODE')
    return null
  }

  const teamlyByEmployee = new Map<string, number>()
  for (const r of employees) {
    if (r.teamly_user_id) teamlyByEmployee.set(r.teamly_user_id, r.telegram_id)
  }
  if (teamlyByEmployee.size === 0) {
    logger.warn('teamly source enabled but no sb_employees have teamly_user_id — events will all be dropped')
  }
  return new TeamlySource(driver, api, {
    resolveTelegramId: (teamlyId) => teamlyByEmployee.get(teamlyId) ?? null,
  })
}

main().catch((err) => {
  logger.error({ err }, 'fatal')
  process.exit(1)
})

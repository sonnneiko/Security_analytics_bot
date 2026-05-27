import { Driver } from 'ydb-sdk'
import { logger } from '../logger.js'

const MIGRATIONS: { name: string; ddl: string }[] = [
  {
    name: '001_sb_employees',
    ddl: `
      CREATE TABLE IF NOT EXISTS sb_employees (
        telegram_id      Uint64,
        teamly_user_id   Utf8,
        mail_address     Utf8,
        full_name        Utf8,
        created_at       Timestamp,
        PRIMARY KEY (telegram_id)
      )
    `,
  },
  {
    name: '002_trigger_chats',
    ddl: `
      CREATE TABLE IF NOT EXISTS trigger_chats (
        chat_id   Int64,
        title     Utf8,
        added_at  Timestamp,
        PRIMARY KEY (chat_id)
      )
    `,
  },
  {
    name: '003_telegram_events',
    ddl: `
      CREATE TABLE IF NOT EXISTS telegram_events (
        event_id      Utf8,
        employee_id   Uint64,
        chat_id       Int64,
        event_type    Utf8,
        occurred_at   Timestamp,
        payload       Json,
        PRIMARY KEY (event_id),
        INDEX idx_employee_time GLOBAL ON (employee_id, occurred_at),
        INDEX idx_chat_time     GLOBAL ON (chat_id, occurred_at)
      )
    `,
  },
]

export async function runMigrations(driver: Driver): Promise<void> {
  for (const { name, ddl } of MIGRATIONS) {
    await driver.queryClient.do({
      timeout: 30_000,
      fn: async (session) => {
        const { opFinished } = await session.execute({ text: ddl })
        await opFinished
      },
    })
    logger.info({ migration: name }, 'migration applied')
  }
}

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
  {
    name: '004_teamly_events',
    ddl: `
      CREATE TABLE IF NOT EXISTS teamly_events (
        event_id         Utf8,
        employee_id      Uint64,
        teamly_user_id   Utf8,
        event_type       Utf8,
        entity_id        Utf8,
        container_id     Utf8,
        occurred_at      Timestamp,
        payload          Json,
        PRIMARY KEY (event_id),
        INDEX idx_employee_time GLOBAL ON (employee_id, occurred_at)
      )
    `,
  },
  {
    name: '005_teamly_tokens',
    ddl: `
      CREATE TABLE IF NOT EXISTS teamly_tokens (
        id                   Utf8,
        access_token         Utf8,
        refresh_token        Utf8,
        access_expires_at    Timestamp,
        refresh_expires_at   Timestamp,
        cluster_domain       Utf8,
        updated_at           Timestamp,
        PRIMARY KEY (id)
      )
    `,
  },
  {
    name: '006_trigger_messages',
    ddl: `
      CREATE TABLE IF NOT EXISTS trigger_messages (
        chat_id      Int64,
        message_id   Int64,
        author_id    Uint64,
        occurred_at  Timestamp,
        PRIMARY KEY (chat_id, message_id)
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

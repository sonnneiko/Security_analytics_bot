import type { Context } from 'grammy'
import type { Driver } from 'ydb-sdk'
import type { TelegramSource } from '../sources/telegram/telegram-source.js'

export interface AppDeps {
  driver: Driver
  telegramSource: TelegramSource
  /** Снапшот sb_employees в памяти. Обновляется командами /add_sb, /remove_sb. */
  sbEmployeeIds: Set<number>
  /** Из ENV BOT_ADMINS. Иммутабельный. */
  botAdminIds: ReadonlySet<number>
}

export type AppContext = Context & { deps: AppDeps }

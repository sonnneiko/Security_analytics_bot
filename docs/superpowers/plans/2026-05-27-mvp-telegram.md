# Security Analytics Bot — MVP Telegram Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Доставить работающую первую итерацию бота: подключение к YDB, регистрация сотрудников СБ и trigger-чатов через команды, сбор Telegram-событий (messages / reactions / trigger replies) в `telegram_events`. Teamly, Excel-отчёты, cron и webhook — следующим планом.

**Architecture:** TypeScript + grammY + Yandex YDB. Слой источников через интерфейс `DataSource` (на этом этапе только `TelegramSource`). В MVP бот работает в polling-режиме — этого достаточно, чтобы проверить сбор событий в реальном чате. `/report` отдаёт заглушку «Excel будет в следующей версии». Spec: [docs/superpowers/specs/2026-05-24-security-analytics-bot-design.md](../specs/2026-05-24-security-analytics-bot-design.md).

**Tech Stack:** Node.js ≥20, TypeScript, grammY 1.x, ydb-sdk, valibot (config schema), pino (logger), vitest (тесты), tsx (dev runner).

**Что НЕ входит в этот план (явно из скоупа MVP-плана):**
- ❌ Teamly: `TeamlySource`, `teamly_daily_stats`, cron daily snapshot
- ❌ `ReportBuilder` и Excel — на месте `/report` заглушка
- ❌ HTTP-сервер (Hono) и webhook-режим
- ❌ Деплой в Yandex Cloud Serverless Container
- ❌ Тесты Excel-листов
- ❌ Локализация через Fluent — пока ru-строки инлайном (нет необходимости i18n при одном языке)

Эти пункты — отдельный план поверх работающего MVP.

---

## File Structure

После выполнения плана:

```
src/
  bot/
    features/
      welcome.ts                  # /start
      sb-management.ts            # /add_sb, /remove_sb, /list_sb
      trigger-chat-management.ts  # /add_trigger_chat, /remove_trigger_chat, /list_trigger_chats
      stats-collector.ts          # message/reaction/reply → TelegramSource
      report.ts                   # /report — заглушка
      access.ts                   # deny-handler для незарегистрированных
      unhandled.ts                # последний middleware
    filters.ts                    # isSbEmployee, hasBotAccess
    context.ts                    # кастомный Context + flavor
    index.ts                      # createBot()
  sources/
    types.ts                      # interface DataSource
    telegram/
      telegram-source.ts          # реализация DataSource
      event-builder.ts            # grammY Update → row для telegram_events
  database/
    client.ts                     # YDB Driver + helper executeQuery
    migrations.ts                 # runMigrations()
    queries/
      employees.ts                # CRUD sb_employees
      trigger-chats.ts            # CRUD trigger_chats
      telegram-events.ts          # insert/exists для telegram_events
  config.ts                       # valibot-схема + загрузка
  logger.ts                       # pino + pino-pretty
  main.ts                         # entrypoint: migrate → bootstrap → init sources → bot.start
tests/
  sources/telegram/event-builder.test.ts
  database/queries/*.integration.test.ts  # запускаются вручную, не в CI
```

Решения о границах:
- `bot/filters.ts` — один файл вместо директории `filters/`: два маленьких предиката, нет смысла плодить файлы.
- `database/client.ts` отделён от `migrations.ts` — миграции вызываются один раз на старте, клиент используется везде; разные жизненные циклы.
- `event-builder` — чистая функция, выделена в отдельный файл, чтобы тестировать без grammY.

---

## Chunk 1: Foundation (зависимости, tooling, config, logger)

Цель: убрать ручной `process.env.X` из `src/config.ts`, поставить остальные runtime-зависимости, добавить тесты и форматирование. По итогам чанка `npm run typecheck` и `npm test` проходят, бот всё ещё запускается из `src/index.ts` (его удалим позже).

### Task 1.1: Установка runtime-зависимостей

**Files:**
- Modify: `package.json`
- Generate: `package-lock.json`

- [ ] **Step 1: Установить prod-зависимости**

```bash
npm install ydb-sdk valibot pino pino-pretty
```

Это добавит:
- `ydb-sdk` — официальный Yandex SDK для YDB
- `valibot` — schema-валидация для config
- `pino` + `pino-pretty` — структурированный логгер

- [ ] **Step 2: Установить dev-зависимости**

```bash
npm install -D vitest @types/node prettier
```

- [ ] **Step 3: Проверить, что package.json валидный**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" && echo OK
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add ydb-sdk, valibot, pino, vitest, prettier"
```

### Task 1.2: Скрипты npm и Prettier

**Files:**
- Modify: `package.json`
- Create: `.prettierrc.json`

- [ ] **Step 1: Обновить scripts в package.json**

Заменить блок `"scripts"`:

```json
"scripts": {
  "dev": "tsx watch src/main.ts",
  "start": "tsx src/main.ts",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "format": "prettier --write 'src/**/*.ts' 'tests/**/*.ts'"
}
```

(Обрати внимание: entrypoint меняется на `src/main.ts` — этот файл появится в Chunk 3. Пока его нет, `npm run dev` упадёт, и это ОК.)

- [ ] **Step 2: Создать `.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 3: Проверка**

```bash
npx prettier --check src/config.ts
```
Expected: либо `All matched files use Prettier code style`, либо warn — оба варианта приемлемы (форматировать будем уже новый код).

- [ ] **Step 4: Commit**

```bash
git add package.json .prettierrc.json
git commit -m "chore: add prettier config and update npm scripts"
```

### Task 1.3: Pino-логгер

**Files:**
- Create: `src/logger.ts`

- [ ] **Step 1: Написать `src/logger.ts`**

```typescript
import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'
const level = process.env.LOG_LEVEL ?? 'info'

export const logger = pino(
  isDev
    ? { level, transport: { target: 'pino-pretty', options: { colorize: true } } }
    : { level },
)
```

- [ ] **Step 2: Проверить, что typecheck зелёный**

```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/logger.ts
git commit -m "feat(logger): add pino logger with dev pretty-print"
```

### Task 1.4: Config через valibot

**Files:**
- Modify: `src/config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Переписать `src/config.ts` через valibot**

```typescript
import 'dotenv/config'
import * as v from 'valibot'

const SbEmployeeSchema = v.object({
  telegram_id: v.number(),
  name: v.string(),
  teamly_user_id: v.optional(v.string()),
})

export type SbEmployee = v.InferOutput<typeof SbEmployeeSchema>

function jsonArray<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  itemSchema: TSchema,
) {
  return v.pipe(
    v.string(),
    v.transform((raw) => JSON.parse(raw) as unknown),
    v.array(itemSchema),
  )
}

const ConfigSchema = v.object({
  botToken: v.pipe(v.string(), v.minLength(10)),
  sbEmployees: jsonArray(SbEmployeeSchema),
  botAdmins: v.optional(jsonArray(v.number()), '[]'),
  ydbEndpoint: v.pipe(v.string(), v.startsWith('grpcs://')),
  ydbDatabase: v.pipe(v.string(), v.startsWith('/')),
  ydbSaKeyFile: v.string(),
  logLevel: v.optional(v.picklist(['trace', 'debug', 'info', 'warn', 'error']), 'info'),
})

export type Config = v.InferOutput<typeof ConfigSchema>

export const config: Config = v.parse(ConfigSchema, {
  botToken: process.env.BOT_TOKEN,
  sbEmployees: process.env.INITIAL_SB_USERS,
  botAdmins: process.env.BOT_ADMINS,
  ydbEndpoint: process.env.YDB_ENDPOINT,
  ydbDatabase: process.env.YDB_DATABASE,
  ydbSaKeyFile: process.env.YDB_SA_KEY_FILE,
  logLevel: process.env.LOG_LEVEL,
})
```

- [ ] **Step 2: Обновить `.env.example`** — добавить новые ключи (YDB_*, LOG_LEVEL).

```env
BOT_TOKEN=
INITIAL_SB_USERS=[{"telegram_id":0,"name":"Имя Фамилия"}]
BOT_ADMINS=[]

# YDB
YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135
YDB_DATABASE=/ru-central1/<cloud>/<db_id>
YDB_SA_KEY_FILE=./secrets/ydb-sa-key.json

# Teamly (для следующего плана)
TEAMLY_API_BASE=https://academy.teamly.ru
TEAMLY_INTEGRATION_ID=
TEAMLY_API_TOKEN=
TEAMLY_API_SECRET=

LOG_LEVEL=info
```

- [ ] **Step 3: Запустить старый `src/index.ts`, чтобы убедиться, что config не сломан**

```bash
npx tsx -e "import('./src/config.ts').then(m => console.log('SB:', m.config.sbEmployees.length, 'admins:', m.config.botAdmins.length))"
```
Expected: `SB: 2 admins: 1`

- [ ] **Step 4: Commit**

```bash
git add src/config.ts .env.example
git commit -m "feat(config): replace ad-hoc env parsing with valibot schema"
```

---

## Chunk 2: YDB client, migrations, queries

Цель: подключиться к созданной базе, накатить миграции 3 таблиц (`sb_employees`, `trigger_chats`, `telegram_events`), уметь делать CRUD.

### Task 2.1: YDB client wrapper

**Files:**
- Create: `src/database/client.ts`

- [ ] **Step 1: Реализовать YDB client**

```typescript
import { Driver, getSACredentialsFromJson, IamAuthService } from 'ydb-sdk'
import { config } from '../config.js'
import { logger } from '../logger.js'

let driverInstance: Driver | null = null

export async function getDriver(): Promise<Driver> {
  if (driverInstance) return driverInstance

  const saCreds = getSACredentialsFromJson(config.ydbSaKeyFile)
  const authService = new IamAuthService(saCreds)

  const driver = new Driver({
    endpoint: config.ydbEndpoint,
    database: config.ydbDatabase,
    authService,
  })

  const ready = await driver.ready(10_000)
  if (!ready) {
    throw new Error('YDB driver failed to become ready within 10s')
  }

  driverInstance = driver
  logger.info({ endpoint: config.ydbEndpoint, database: config.ydbDatabase }, 'YDB connected')
  return driver
}

export async function closeDriver(): Promise<void> {
  if (driverInstance) {
    await driverInstance.destroy()
    driverInstance = null
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Sanity-check подключения**

```bash
npx tsx -e "import('./src/database/client.ts').then(async (m) => { const d = await m.getDriver(); console.log('OK'); await m.closeDriver() })"
```
Expected: `YDB connected` лог и `OK`.

Если падает с auth-ошибкой — проверь `secrets/ydb-sa-key.json` и `YDB_SA_KEY_FILE` в `.env`.

- [ ] **Step 4: Commit**

```bash
git add src/database/client.ts
git commit -m "feat(db): add YDB driver with SA-key auth"
```

### Task 2.2: Migrations

**Files:**
- Create: `src/database/migrations.ts`

- [ ] **Step 1: Реализовать миграции**

```typescript
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
    await driver.tableClient.withSession(async (session) => {
      await session.executeQuery(ddl)
    })
    logger.info({ migration: name }, 'migration applied')
  }
}
```

(`CREATE TABLE IF NOT EXISTS` делает миграции идемпотентными — повторный запуск безопасен.)

- [ ] **Step 2: Sanity-check — накатить миграции**

```bash
npx tsx -e "import('./src/database/client.ts').then(async (c) => { const d = await c.getDriver(); const m = await import('./src/database/migrations.ts'); await m.runMigrations(d); await c.closeDriver() })"
```
Expected: три лога `migration applied`.

- [ ] **Step 3: Проверить, что таблицы появились в YDB-консоли** — открыть https://console.yandex.cloud/ → YDB → `security-analytics-bot-db` → Navigation → должны быть `sb_employees`, `trigger_chats`, `telegram_events`.

- [ ] **Step 4: Повторно прогнать миграции** — убедиться, что идемпотентно.

```bash
npx tsx -e "import('./src/database/client.ts').then(async (c) => { const d = await c.getDriver(); const m = await import('./src/database/migrations.ts'); await m.runMigrations(d); await c.closeDriver() })"
```
Expected: те же три лога, без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/database/migrations.ts
git commit -m "feat(db): add migrations for sb_employees, trigger_chats, telegram_events"
```

### Task 2.3: Queries — sb_employees

**Files:**
- Create: `src/database/queries/employees.ts`

- [ ] **Step 1: Реализовать CRUD для sb_employees**

```typescript
import { Driver, Ydb, TypedValues, declareType, Types } from 'ydb-sdk'
import { logger } from '../../logger.js'

export interface SbEmployeeRow {
  telegram_id: bigint
  teamly_user_id: string | null
  full_name: string
  created_at: Date
}

export async function upsertEmployee(
  driver: Driver,
  row: { telegram_id: number | bigint; full_name: string; teamly_user_id?: string | null },
): Promise<void> {
  const teamlyId = row.teamly_user_id ?? null
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(
      `
      DECLARE $tg_id AS Uint64;
      DECLARE $teamly AS Utf8?;
      DECLARE $name AS Utf8;
      DECLARE $now AS Timestamp;
      UPSERT INTO sb_employees (telegram_id, teamly_user_id, full_name, created_at)
      VALUES ($tg_id, $teamly, $name, $now);
      `,
      {
        $tg_id: TypedValues.uint64(BigInt(row.telegram_id)),
        $teamly: teamlyId === null ? TypedValues.optional(TypedValues.utf8(''), null) : TypedValues.optionalUtf8(teamlyId),
        $name: TypedValues.utf8(row.full_name),
        $now: TypedValues.timestamp(new Date()),
      },
    )
  })
}

export async function removeEmployee(driver: Driver, telegramId: number | bigint): Promise<void> {
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(
      `
      DECLARE $tg_id AS Uint64;
      DELETE FROM sb_employees WHERE telegram_id = $tg_id;
      `,
      { $tg_id: TypedValues.uint64(BigInt(telegramId)) },
    )
  })
}

export async function listEmployees(driver: Driver): Promise<SbEmployeeRow[]> {
  return driver.tableClient.withSession(async (session) => {
    const { resultSets } = await session.executeQuery(`
      SELECT telegram_id, teamly_user_id, full_name, created_at FROM sb_employees ORDER BY created_at;
    `)
    const rows = resultSets[0].rows ?? []
    return rows.map((row) => ({
      telegram_id: BigInt(row.items![0].uint64Value!.toString()),
      teamly_user_id: row.items![1].textValue ?? null,
      full_name: row.items![2].textValue!,
      created_at: new Date(Number(row.items![3].uint64Value)),
    }))
  })
}

export async function isEmployee(driver: Driver, telegramId: number | bigint): Promise<boolean> {
  return driver.tableClient.withSession(async (session) => {
    const { resultSets } = await session.executeQuery(
      `
      DECLARE $tg_id AS Uint64;
      SELECT 1 FROM sb_employees WHERE telegram_id = $tg_id;
      `,
      { $tg_id: TypedValues.uint64(BigInt(telegramId)) },
    )
    return (resultSets[0].rows?.length ?? 0) > 0
  })
}
```

> ⚠️ Конкретный синтаксис `TypedValues` зависит от версии `ydb-sdk`. Если что-то не собирается типами — посмотри `node_modules/ydb-sdk/build/cjs/src/types.d.ts`, там `TypedValues.utf8 / uint64 / optionalUtf8 / timestamp`. Главное — типы из DECLARE соответствуют значениям. **Не глуши TS-ошибки `as any` — это первый источник багов в YDB-коде.**

- [ ] **Step 2: Интеграционная проверка**

```bash
npx tsx -e "(async () => { const c = await import('./src/database/client.ts'); const q = await import('./src/database/queries/employees.ts'); const d = await c.getDriver(); await q.upsertEmployee(d, { telegram_id: 6300594719, full_name: 'Ани Тоноян' }); console.log(await q.listEmployees(d)); await c.closeDriver() })()"
```
Expected: лог со строкой про Ани Тоноян.

- [ ] **Step 3: Commit**

```bash
git add src/database/queries/employees.ts
git commit -m "feat(db): add CRUD queries for sb_employees"
```

### Task 2.4: Queries — trigger_chats

**Files:**
- Create: `src/database/queries/trigger-chats.ts`

- [ ] **Step 1: Реализовать CRUD по аналогии с employees**

```typescript
import { Driver, TypedValues } from 'ydb-sdk'

export interface TriggerChatRow {
  chat_id: bigint
  title: string
  added_at: Date
}

export async function upsertTriggerChat(
  driver: Driver,
  chat: { chat_id: number | bigint; title: string },
): Promise<void> {
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(
      `
      DECLARE $chat_id AS Int64;
      DECLARE $title AS Utf8;
      DECLARE $now AS Timestamp;
      UPSERT INTO trigger_chats (chat_id, title, added_at) VALUES ($chat_id, $title, $now);
      `,
      {
        $chat_id: TypedValues.int64(BigInt(chat.chat_id)),
        $title: TypedValues.utf8(chat.title),
        $now: TypedValues.timestamp(new Date()),
      },
    )
  })
}

export async function removeTriggerChat(driver: Driver, chatId: number | bigint): Promise<void> {
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(
      `
      DECLARE $chat_id AS Int64;
      DELETE FROM trigger_chats WHERE chat_id = $chat_id;
      `,
      { $chat_id: TypedValues.int64(BigInt(chatId)) },
    )
  })
}

export async function listTriggerChats(driver: Driver): Promise<TriggerChatRow[]> {
  return driver.tableClient.withSession(async (session) => {
    const { resultSets } = await session.executeQuery(
      `SELECT chat_id, title, added_at FROM trigger_chats ORDER BY added_at;`,
    )
    const rows = resultSets[0].rows ?? []
    return rows.map((row) => ({
      chat_id: BigInt(row.items![0].int64Value!.toString()),
      title: row.items![1].textValue!,
      added_at: new Date(Number(row.items![2].uint64Value)),
    }))
  })
}

export async function isTriggerChat(driver: Driver, chatId: number | bigint): Promise<boolean> {
  return driver.tableClient.withSession(async (session) => {
    const { resultSets } = await session.executeQuery(
      `
      DECLARE $chat_id AS Int64;
      SELECT 1 FROM trigger_chats WHERE chat_id = $chat_id;
      `,
      { $chat_id: TypedValues.int64(BigInt(chatId)) },
    )
    return (resultSets[0].rows?.length ?? 0) > 0
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/database/queries/trigger-chats.ts
git commit -m "feat(db): add CRUD queries for trigger_chats"
```

### Task 2.5: Queries — telegram_events

**Files:**
- Create: `src/database/queries/telegram-events.ts`

- [ ] **Step 1: Реализовать insert + count для отчётов**

```typescript
import { Driver, TypedValues } from 'ydb-sdk'

export type TelegramEventType = 'message' | 'reaction' | 'trigger_reply'

export interface TelegramEventRow {
  event_id: string
  employee_id: bigint
  chat_id: bigint
  event_type: TelegramEventType
  occurred_at: Date
  payload: Record<string, unknown>
}

export async function insertEvent(driver: Driver, row: TelegramEventRow): Promise<void> {
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(
      `
      DECLARE $event_id AS Utf8;
      DECLARE $employee_id AS Uint64;
      DECLARE $chat_id AS Int64;
      DECLARE $event_type AS Utf8;
      DECLARE $occurred_at AS Timestamp;
      DECLARE $payload AS Json;
      UPSERT INTO telegram_events
        (event_id, employee_id, chat_id, event_type, occurred_at, payload)
      VALUES
        ($event_id, $employee_id, $chat_id, $event_type, $occurred_at, $payload);
      `,
      {
        $event_id: TypedValues.utf8(row.event_id),
        $employee_id: TypedValues.uint64(row.employee_id),
        $chat_id: TypedValues.int64(row.chat_id),
        $event_type: TypedValues.utf8(row.event_type),
        $occurred_at: TypedValues.timestamp(row.occurred_at),
        $payload: TypedValues.json(JSON.stringify(row.payload)),
      },
    )
  })
}
```

(Запросы для отчётов — count по периоду — добавляем в плане 2 вместе с ReportBuilder.)

- [ ] **Step 2: Интеграционная проверка**

```bash
npx tsx -e "(async () => { const c = await import('./src/database/client.ts'); const q = await import('./src/database/queries/telegram-events.ts'); const d = await c.getDriver(); await q.insertEvent(d, { event_id: 'tg:1:1:message', employee_id: 6300594719n, chat_id: -1001n, event_type: 'message', occurred_at: new Date(), payload: { text: 'test' } }); console.log('OK'); await c.closeDriver() })()"
```
Expected: `OK`.

- [ ] **Step 3: Удалить тестовую строку (чтобы база была чистая)**

```bash
yc ydb yql -e grpcs://ydb.serverless.yandexcloud.net:2135 -d /ru-central1/b1g4pbcq0774ad7h7bla/etn5kgqrt24j7cvb0ea4 -f "DELETE FROM telegram_events WHERE event_id = 'tg:1:1:message'"
```
(Опционально — если хочется чистой базы. На прод-данные ещё не влияет.)

- [ ] **Step 4: Commit**

```bash
git add src/database/queries/telegram-events.ts
git commit -m "feat(db): add insert query for telegram_events"
```

---

## Chunk 3: Bootstrap + bot core + features + TelegramSource

Цель: переписать `src/index.ts` в новую архитектуру. После этого чанка работающий бот в polling-режиме:
- стартует, накатывает миграции, бутстрапит `INITIAL_SB_USERS`
- даёт сотрудникам СБ и `BOT_ADMINS` команды `/add_sb`, `/remove_sb`, `/list_sb`, `/add_trigger_chat`, `/remove_trigger_chat`, `/list_trigger_chats`, `/report`
- собирает в trigger-чатах messages/reactions/trigger_replies от sb_employees в `telegram_events`
- незарегистрированным отвечает «нет доступа + ваш Telegram ID»

### Task 3.1: DataSource interface и event-builder (TDD)

**Files:**
- Create: `src/sources/types.ts`
- Create: `src/sources/telegram/event-builder.ts`
- Create: `tests/sources/telegram/event-builder.test.ts`

Используем TDD: event-builder — чистая функция, легко тестируется, ошибки тут дорого стоят (искажают всю статистику).

- [ ] **Step 1: Написать `src/sources/types.ts`**

```typescript
export interface DateRange {
  from: Date
  to: Date
}

export interface DataSource {
  readonly name: 'telegram' | 'teamly' | 'mail'
  init(): Promise<void>
  handleIncomingEvent?(update: unknown): Promise<void>
  ensureFreshSnapshot?(period: DateRange): Promise<void>
}
```

- [ ] **Step 2: Написать failing-тесты в `tests/sources/telegram/event-builder.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { buildEvents, type EventInput } from '../../../src/sources/telegram/event-builder.js'

const SB_EMPLOYEE_ID = 6300594719n
const OTHER_USER_ID = 1234567n
const CHAT_ID = -1001234n

describe('event-builder', () => {
  it('возвращает [] для сообщения от не-сотрудника СБ', () => {
    const input: EventInput = {
      kind: 'message',
      chatId: CHAT_ID,
      messageId: 10,
      fromId: OTHER_USER_ID,
      date: new Date('2026-05-27T10:00:00Z'),
      replyToMessageId: undefined,
      replyToUserId: undefined,
      text: 'hello',
    }
    expect(buildEvents(input, { isSbEmployee: () => false })).toEqual([])
  })

  it('строит message-event для сообщения сотрудника СБ без reply', () => {
    const input: EventInput = {
      kind: 'message',
      chatId: CHAT_ID,
      messageId: 10,
      fromId: SB_EMPLOYEE_ID,
      date: new Date('2026-05-27T10:00:00Z'),
      replyToMessageId: undefined,
      replyToUserId: undefined,
      text: 'hello',
    }
    const events = buildEvents(input, { isSbEmployee: (id) => id === SB_EMPLOYEE_ID })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      event_id: `tg:${CHAT_ID}:10:message`,
      employee_id: SB_EMPLOYEE_ID,
      chat_id: CHAT_ID,
      event_type: 'message',
    })
  })

  it('строит message + trigger_reply, если сотрудник СБ отвечает не-сотруднику', () => {
    const input: EventInput = {
      kind: 'message',
      chatId: CHAT_ID,
      messageId: 11,
      fromId: SB_EMPLOYEE_ID,
      date: new Date('2026-05-27T10:00:00Z'),
      replyToMessageId: 9,
      replyToUserId: OTHER_USER_ID,
      text: 'reply',
    }
    const events = buildEvents(input, { isSbEmployee: (id) => id === SB_EMPLOYEE_ID })
    const types = events.map((e) => e.event_type).sort()
    expect(types).toEqual(['message', 'trigger_reply'])
    const triggerReply = events.find((e) => e.event_type === 'trigger_reply')!
    expect(triggerReply.event_id).toBe(`tg:${CHAT_ID}:11:trigger_reply`)
    expect(triggerReply.payload).toMatchObject({ reply_to_message_id: 9 })
  })

  it('НЕ строит trigger_reply, если сотрудник СБ отвечает другому сотруднику СБ', () => {
    const ANOTHER_SB_ID = 7924502831n
    const input: EventInput = {
      kind: 'message',
      chatId: CHAT_ID,
      messageId: 12,
      fromId: SB_EMPLOYEE_ID,
      date: new Date('2026-05-27T10:00:00Z'),
      replyToMessageId: 9,
      replyToUserId: ANOTHER_SB_ID,
      text: 'reply',
    }
    const events = buildEvents(input, {
      isSbEmployee: (id) => id === SB_EMPLOYEE_ID || id === ANOTHER_SB_ID,
    })
    expect(events.map((e) => e.event_type)).toEqual(['message'])
  })

  it('строит reaction-event для эмодзи-реакции сотрудника СБ', () => {
    const input: EventInput = {
      kind: 'reaction',
      chatId: CHAT_ID,
      messageId: 20,
      fromId: SB_EMPLOYEE_ID,
      date: new Date('2026-05-27T10:00:00Z'),
      emoji: '👍',
    }
    const events = buildEvents(input, { isSbEmployee: () => true })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      event_id: `tg:${CHAT_ID}:20:reaction:6300594719:👍`,
      event_type: 'reaction',
      payload: { emoji: '👍' },
    })
  })
})
```

- [ ] **Step 3: Запустить тесты — должны упасть**

```bash
npm test
```
Expected: FAIL — `Cannot find module .../event-builder`.

- [ ] **Step 4: Реализовать `src/sources/telegram/event-builder.ts`**

```typescript
import type { TelegramEventRow, TelegramEventType } from '../../database/queries/telegram-events.js'

export type EventInput =
  | {
      kind: 'message'
      chatId: bigint
      messageId: number
      fromId: bigint
      date: Date
      replyToMessageId: number | undefined
      replyToUserId: bigint | undefined
      text: string | undefined
    }
  | {
      kind: 'reaction'
      chatId: bigint
      messageId: number
      fromId: bigint
      date: Date
      emoji: string
    }

export interface EventBuilderDeps {
  isSbEmployee: (telegramId: bigint) => boolean
}

export function buildEvents(input: EventInput, deps: EventBuilderDeps): TelegramEventRow[] {
  if (!deps.isSbEmployee(input.fromId)) return []

  if (input.kind === 'reaction') {
    return [
      {
        event_id: `tg:${input.chatId}:${input.messageId}:reaction:${input.fromId}:${input.emoji}`,
        employee_id: input.fromId,
        chat_id: input.chatId,
        event_type: 'reaction',
        occurred_at: input.date,
        payload: { emoji: input.emoji, target_message_id: input.messageId },
      },
    ]
  }

  // message
  const events: TelegramEventRow[] = [
    {
      event_id: `tg:${input.chatId}:${input.messageId}:message`,
      employee_id: input.fromId,
      chat_id: input.chatId,
      event_type: 'message',
      occurred_at: input.date,
      payload: { text: input.text ?? '' },
    },
  ]

  const isTriggerReply =
    input.replyToMessageId !== undefined &&
    input.replyToUserId !== undefined &&
    !deps.isSbEmployee(input.replyToUserId)

  if (isTriggerReply) {
    events.push({
      event_id: `tg:${input.chatId}:${input.messageId}:trigger_reply`,
      employee_id: input.fromId,
      chat_id: input.chatId,
      event_type: 'trigger_reply',
      occurred_at: input.date,
      payload: {
        reply_to_message_id: input.replyToMessageId,
        reply_to_user_id: input.replyToUserId!.toString(),
      },
    })
  }

  return events
}
```

- [ ] **Step 5: Прогнать тесты — должны пройти**

```bash
npm test
```
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/sources/types.ts src/sources/telegram/event-builder.ts tests/sources/telegram/event-builder.test.ts
git commit -m "feat(sources): add DataSource interface and tested event-builder"
```

### Task 3.2: TelegramSource

**Files:**
- Create: `src/sources/telegram/telegram-source.ts`

- [ ] **Step 1: Реализовать TelegramSource**

```typescript
import { Driver } from 'ydb-sdk'
import { logger } from '../../logger.js'
import type { DataSource } from '../types.js'
import { insertEvent } from '../../database/queries/telegram-events.js'
import { buildEvents, type EventInput } from './event-builder.js'

export class TelegramSource implements DataSource {
  readonly name = 'telegram' as const

  constructor(
    private readonly driver: Driver,
    private readonly deps: {
      isSbEmployee: (id: bigint) => boolean
      isTriggerChat: (chatId: bigint) => Promise<boolean>
    },
  ) {}

  async init(): Promise<void> {
    // nothing to init — driver уже готов
  }

  async handleIncomingEvent(input: EventInput): Promise<void> {
    // фильтр чата: только trigger_chats
    const inTriggerChat = await this.deps.isTriggerChat(input.chatId)
    if (!inTriggerChat) return

    const events = buildEvents(input, { isSbEmployee: this.deps.isSbEmployee })
    for (const ev of events) {
      try {
        await insertEvent(this.driver, ev)
        logger.debug({ event: ev.event_type, employee: ev.employee_id.toString() }, 'telegram event saved')
      } catch (err) {
        logger.error({ err, event: ev }, 'failed to insert telegram event')
      }
    }
  }
}
```

Замечание: `isTriggerChat` идёт в БД на каждое событие. Это нормально для MVP (low traffic, у YDB кеш сессий). Если станет узким местом — кешировать список trigger-чатов в памяти; cache invalidation делает при `/add_trigger_chat` и `/remove_trigger_chat`.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/sources/telegram/telegram-source.ts
git commit -m "feat(sources): add TelegramSource with trigger-chat filter"
```

### Task 3.3: Bot context, filters, scaffold

**Files:**
- Create: `src/bot/context.ts`
- Create: `src/bot/filters.ts`
- Create: `src/bot/index.ts`

- [ ] **Step 1: `src/bot/context.ts`**

```typescript
import type { Context } from 'grammy'
import type { Driver } from 'ydb-sdk'
import type { TelegramSource } from '../sources/telegram/telegram-source.js'

export interface AppDeps {
  driver: Driver
  telegramSource: TelegramSource
  /** Снапшот sb_employees в памяти. Обновляется командами /add_sb, /remove_sb. */
  sbEmployeeIds: Set<bigint>
  /** Из ENV BOT_ADMINS. Иммутабельный. */
  botAdminIds: ReadonlySet<bigint>
}

export type AppContext = Context & { deps: AppDeps }
```

- [ ] **Step 2: `src/bot/filters.ts`**

```typescript
import type { AppContext } from './context.js'

export function isSbEmployee(ctx: AppContext): boolean {
  const id = ctx.from?.id
  if (id === undefined) return false
  return ctx.deps.sbEmployeeIds.has(BigInt(id))
}

export function hasBotAccess(ctx: AppContext): boolean {
  const id = ctx.from?.id
  if (id === undefined) return false
  const bigId = BigInt(id)
  return ctx.deps.sbEmployeeIds.has(bigId) || ctx.deps.botAdminIds.has(bigId)
}
```

- [ ] **Step 3: `src/bot/index.ts` — пустой каркас createBot**

```typescript
import { Bot } from 'grammy'
import type { AppContext, AppDeps } from './context.js'
import { registerWelcome } from './features/welcome.js'
import { registerAccess } from './features/access.js'
import { registerSbManagement } from './features/sb-management.js'
import { registerTriggerChatManagement } from './features/trigger-chat-management.js'
import { registerReport } from './features/report.js'
import { registerStatsCollector } from './features/stats-collector.js'
import { registerUnhandled } from './features/unhandled.js'

export function createBot(token: string, deps: AppDeps): Bot<AppContext> {
  const bot = new Bot<AppContext>(token)

  // прокинуть deps в каждый ctx
  bot.use((ctx, next) => {
    ;(ctx as AppContext).deps = deps
    return next()
  })

  // ВАЖНО: stats-collector должен быть ПЕРЕД access — иначе deny-handler съест событие
  registerStatsCollector(bot)

  // команды и доступ
  registerWelcome(bot)
  registerSbManagement(bot)
  registerTriggerChatManagement(bot)
  registerReport(bot)
  registerAccess(bot) // deny для незарегистрированных + неизвестные команды

  registerUnhandled(bot)

  return bot
}
```

- [ ] **Step 4: Commit (без билда, потому что features ещё не написаны)**

```bash
git add src/bot/context.ts src/bot/filters.ts src/bot/index.ts
git commit -m "feat(bot): add context, filters, createBot scaffold"
```

### Task 3.4: Features — welcome, access, unhandled

**Files:**
- Create: `src/bot/features/welcome.ts`
- Create: `src/bot/features/access.ts`
- Create: `src/bot/features/unhandled.ts`

- [ ] **Step 1: `welcome.ts`**

```typescript
import type { Bot } from 'grammy'
import type { AppContext } from '../context.js'
import { hasBotAccess } from '../filters.js'

export function registerWelcome(bot: Bot<AppContext>): void {
  bot.command('start', async (ctx) => {
    if (!ctx.chat || ctx.chat.type !== 'private') return
    if (!hasBotAccess(ctx)) return // обработает registerAccess
    const name = ctx.from?.first_name ?? 'коллега'
    await ctx.reply(`Привет, ${name}! Я бот статистики СБ.\n\nКоманды:\n/report month — отчёт за месяц\n/list_sb — список сотрудников\n/list_trigger_chats — список trigger-чатов`)
  })
}
```

- [ ] **Step 2: `access.ts` — обрабатывает всё, что осталось без ответа в ЛС**

```typescript
import type { Bot } from 'grammy'
import type { AppContext } from '../context.js'
import { hasBotAccess } from '../filters.js'

const DENY_MESSAGE = (id: number) =>
  `Нет доступа. Ваш Telegram ID: ${id}\n\nЕсли это ошибка, напишите @Alhazova_UnitPay.`

export function registerAccess(bot: Bot<AppContext>): void {
  // Только в ЛС: незарегистрированные получают свой telegram_id
  bot.chatType('private').on('message', async (ctx) => {
    if (hasBotAccess(ctx)) return
    if (ctx.from) await ctx.reply(DENY_MESSAGE(ctx.from.id))
  })
}
```

- [ ] **Step 3: `unhandled.ts` — заглушка, чтобы не падало**

```typescript
import type { Bot } from 'grammy'
import type { AppContext } from '../context.js'

export function registerUnhandled(bot: Bot<AppContext>): void {
  bot.catch((err) => {
    // ошибки уходят в logger через bot-level error handler в main.ts
    console.error('bot error', err)
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/bot/features/welcome.ts src/bot/features/access.ts src/bot/features/unhandled.ts
git commit -m "feat(bot): add welcome, access (deny), unhandled features"
```

### Task 3.5: Feature — sb-management

**Files:**
- Create: `src/bot/features/sb-management.ts`

- [ ] **Step 1: Реализовать команды `/add_sb`, `/remove_sb`, `/list_sb`**

```typescript
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
    const args = ctx.match?.toString().trim().split(/\s+/) ?? []
    if (args.length < 2) {
      await ctx.reply('Использование: /add_sb <telegram_id> <ФИО> [teamly_user_id]')
      return
    }
    const [tgIdStr, ...rest] = args
    const tgId = Number(tgIdStr)
    if (!Number.isFinite(tgId) || tgId <= 0) {
      await ctx.reply('telegram_id должен быть числом')
      return
    }
    // последний аргумент — teamly_user_id, если выглядит как UUID или просто без пробелов;
    // упрощаем: если в строке есть точно 2+ слова, последнее — teamly, остальное ФИО,
    // НО только если последнее слово выглядит как UUID/идентификатор. Иначе — всё ФИО.
    let teamlyId: string | undefined
    let nameParts = rest
    const last = rest[rest.length - 1]
    if (last && /^[a-f0-9-]{8,}$/i.test(last)) {
      teamlyId = last
      nameParts = rest.slice(0, -1)
    }
    const fullName = nameParts.join(' ').trim()
    if (!fullName) {
      await ctx.reply('Не указано ФИО')
      return
    }
    await upsertEmployee(ctx.deps.driver, {
      telegram_id: tgId,
      full_name: fullName,
      teamly_user_id: teamlyId ?? null,
    })
    ctx.deps.sbEmployeeIds.add(BigInt(tgId))
    await ctx.reply(`Добавлен: ${fullName} (tg:${tgId}${teamlyId ? `, teamly:${teamlyId}` : ''})`)
  })

  bot.command('remove_sb', async (ctx) => {
    if (!hasBotAccess(ctx)) return
    const tgId = Number(ctx.match?.toString().trim())
    if (!Number.isFinite(tgId) || tgId <= 0) {
      await ctx.reply('Использование: /remove_sb <telegram_id>')
      return
    }
    await removeEmployee(ctx.deps.driver, tgId)
    ctx.deps.sbEmployeeIds.delete(BigInt(tgId))
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
      (r) => `• ${r.full_name} (tg:${r.telegram_id}${r.teamly_user_id ? `, teamly:${r.teamly_user_id}` : ''})`,
    )
    await ctx.reply(`Сотрудники СБ:\n${lines.join('\n')}`)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/bot/features/sb-management.ts
git commit -m "feat(bot): add /add_sb, /remove_sb, /list_sb commands"
```

### Task 3.6: Feature — trigger-chat-management

**Files:**
- Create: `src/bot/features/trigger-chat-management.ts`

- [ ] **Step 1: Реализовать команды**

```typescript
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
    const arg = ctx.match?.toString().trim()
    let chatId: bigint
    let title: string
    if (arg) {
      const parsed = Number(arg)
      if (!Number.isFinite(parsed)) {
        await ctx.reply('Использование: /add_trigger_chat — текущий чат, либо /add_trigger_chat <chat_id>')
        return
      }
      chatId = BigInt(parsed)
      title = `chat_${parsed}`
    } else {
      if (!ctx.chat) return
      chatId = BigInt(ctx.chat.id)
      title = 'title' in ctx.chat && ctx.chat.title ? ctx.chat.title : `chat_${ctx.chat.id}`
    }
    await upsertTriggerChat(ctx.deps.driver, { chat_id: chatId, title })
    await ctx.reply(`Trigger-чат добавлен: ${title} (id:${chatId})`)
  })

  bot.command('remove_trigger_chat', async (ctx) => {
    if (!hasBotAccess(ctx)) return
    const arg = ctx.match?.toString().trim()
    const chatId = arg ? BigInt(Number(arg)) : ctx.chat ? BigInt(ctx.chat.id) : null
    if (chatId === null) {
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
```

- [ ] **Step 2: Commit**

```bash
git add src/bot/features/trigger-chat-management.ts
git commit -m "feat(bot): add /add_trigger_chat, /remove_trigger_chat, /list_trigger_chats"
```

### Task 3.7: Feature — stats-collector

**Files:**
- Create: `src/bot/features/stats-collector.ts`

- [ ] **Step 1: Реализовать middleware, подающий events в TelegramSource**

```typescript
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
      chatId: BigInt(ctx.chat.id),
      messageId: ctx.message.message_id,
      fromId: BigInt(ctx.from.id),
      date: new Date(ctx.message.date * 1000),
      replyToMessageId: reply?.message_id,
      replyToUserId: reply?.from ? BigInt(reply.from.id) : undefined,
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
        chatId: BigInt(ctx.chat.id),
        messageId: r.message_id,
        fromId: BigInt(userId),
        date: new Date(r.date * 1000),
        emoji: reaction.emoji,
      })
    }
    return next()
  })
}
```

> ⚠️ Чтобы grammY доставлял `message_reaction`, надо передать `allowed_updates: ['message', 'message_reaction', 'callback_query']` в `bot.start()`. Это сделаем в `main.ts`. Также реакции работают только в группах, где бот — админ; этот момент стоит проверить на проде.

- [ ] **Step 2: Commit**

```bash
git add src/bot/features/stats-collector.ts
git commit -m "feat(bot): add stats-collector middleware for messages and reactions"
```

### Task 3.8: Feature — report (заглушка)

**Files:**
- Create: `src/bot/features/report.ts`

- [ ] **Step 1: Реализовать заглушку**

```typescript
import type { Bot } from 'grammy'
import type { AppContext } from '../context.js'
import { hasBotAccess } from '../filters.js'

export function registerReport(bot: Bot<AppContext>): void {
  bot.command('report', async (ctx) => {
    if (!hasBotAccess(ctx)) return
    await ctx.reply(
      'Отчёт пока не готов — собираем события из триггерных чатов. Excel-сборка появится в следующей версии.',
    )
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/bot/features/report.ts
git commit -m "feat(bot): add /report stub"
```

### Task 3.9: main.ts entrypoint и удаление старого src/index.ts

**Files:**
- Create: `src/main.ts`
- Delete: `src/index.ts`

- [ ] **Step 1: Написать `src/main.ts`**

```typescript
import { config } from './config.js'
import { logger } from './logger.js'
import { getDriver, closeDriver } from './database/client.js'
import { runMigrations } from './database/migrations.js'
import {
  upsertEmployee,
  listEmployees,
  isEmployee,
} from './database/queries/employees.js'
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
  const botAdminIds = new Set(config.botAdmins.map((id) => BigInt(id)))

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
    onStart: (info) => logger.info({ bot: info.username, sb: sbEmployeeIds.size }, 'bot started'),
  })
}

main().catch((err) => {
  logger.error({ err }, 'fatal')
  process.exit(1)
})
```

- [ ] **Step 2: Удалить старый `src/index.ts`**

```bash
git rm src/index.ts
```

- [ ] **Step 3: Запустить typecheck**

```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 4: Запустить бот локально**

```bash
npm run dev
```
Expected:
- лог `YDB connected`
- три лога `migration applied`
- лог `bootstrapped sb employee` для Ани и Светланы (если первый запуск)
- лог `bot started @UnitSecurity_analytics_bot sb=2`

- [ ] **Step 5: Проверка вручную (через Telegram)**

В ЛС бота:
1. От Сони (BOT_ADMIN): `/start` → приветствие; `/list_sb` → Ани и Светлана; `/list_trigger_chats` → пусто.
2. С незнакомого аккаунта: написать `привет` → ответ «Нет доступа. Ваш Telegram ID: …».

В группе, где бот добавлен:
3. `/add_trigger_chat` от Сони → «Trigger-чат добавлен: …».
4. Сотрудник СБ пишет в этом чате сообщение → проверить в YDB:

```bash
yc ydb yql -e grpcs://ydb.serverless.yandexcloud.net:2135 \
  -d /ru-central1/b1g4pbcq0774ad7h7bla/etn5kgqrt24j7cvb0ea4 \
  -f "SELECT event_id, event_type, employee_id, chat_id, occurred_at FROM telegram_events ORDER BY occurred_at DESC LIMIT 10"
```
Expected: появилась строка с `event_type='message'`.

5. Сотрудник СБ отвечает на сообщение не-сотрудника в trigger-чате → должны появиться `message` и `trigger_reply`.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git rm src/index.ts 2>/dev/null || true
git commit -m "feat: wire up YDB, sources, bot in main.ts; remove old src/index.ts"
```

---

## Chunk 4: Дочистка

### Task 4.1: README обновить под новый запуск

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Обновить раздел «Запуск»** — указать новые ENV (`YDB_*`), команду `npm run dev` запускает `src/main.ts`, и тот сам накатывает миграции.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for MVP setup (YDB envs, main.ts entrypoint)"
```

### Task 4.2: Push на origin/main (после согласия пользователя)

- [ ] **Step 1: Запросить разрешение на push**

«Готов запушить ветку main с MVP-имплементацией. Делать?»

- [ ] **Step 2: Если ОК — `git push origin main`**

---

## Финальная проверка (после Chunk 3)

В режиме «прод-симуляции» — бот запущен локально, у тебя в Telegram доступ как BOT_ADMIN:

- [ ] `/list_sb` показывает Ани и Светлану
- [ ] `/add_trigger_chat` в реальной триггерной группе работает
- [ ] Сообщение сотрудника СБ в trigger-чате → строка в `telegram_events` с `event_type='message'`
- [ ] Reply сотрудника СБ на сообщение постороннего → строка `trigger_reply`
- [ ] Эмодзи-реакция сотрудника СБ → строка `reaction` (требует, чтобы бот был админом группы и можно было видеть реакции)
- [ ] Не-сотрудник пишет в trigger-чате → ничего не пишется в `telegram_events`
- [ ] Соня (BOT_ADMIN) пишет в trigger-чате → ничего не пишется (она не в `sbEmployeeIds`)

Если всё ок — MVP готов. План 2 (Teamly + Excel + cron + webhook + деплой) пишем поверх него.

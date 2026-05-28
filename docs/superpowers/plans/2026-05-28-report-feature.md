# Отчёт `/report` — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать рабочую команду `/report week|month`, которая собирает Excel-отчёт активности СБ (обработанные/уникальные триггеры в Telegram + созданные карточки/комментарии в Teamly) из данных YDB.

**Architecture:** Сбор переписывается на «триггерную» модель: внешние сообщения пишутся в новую таблицу `trigger_messages`, реакции сотрудника матчатся с триггером по PK. Чистая функция `buildIntents` классифицирует апдейт в намерения, `resolveIntents` (с инъектируемым lookup) превращает их в строки БД — обе тестируются без БД. Отчёт строится чисто из БД: выборка строк за период → агрегация в TS → ExcelJS-воркбук → файл в ЛС.

**Tech Stack:** TypeScript (ESM), grammY, ydb-sdk, ExcelJS (новая зависимость), vitest. Спек: [docs/superpowers/specs/2026-05-28-report-feature-design.md](../specs/2026-05-28-report-feature-design.md).

**Соглашения по проекту:**
- YDB возвращает поля строк в camelCase (`event_type` → `eventType`, `occurred_at` → `occurredAt`). `payload Json` приходит строкой → `JSON.parse`.
- МСК = UTC+3 без DST → `const MSK_OFFSET_MS = 3 * 60 * 60 * 1000`.
- Тесты-файлы — `tests/...` зеркалят `src/...`. Запуск: `npm test` (vitest run).
- Коммитим часто, по завершении задачи.

**Worktree:** план выполняется на `main` (дерево чистое, проект личный). Изоляция не требуется.

---

## Chunk 1: Слой данных (миграция + запросы)

### Task 1: Миграция `006_trigger_messages`

**Files:**
- Modify: `src/database/migrations.ts` (добавить элемент в массив `MIGRATIONS` после `005_teamly_tokens`)

- [ ] **Step 1: Добавить миграцию**

В массив `MIGRATIONS` (после объекта `005_teamly_tokens`) добавить:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (нет ошибок).

- [ ] **Step 3: Commit**

```bash
git add src/database/migrations.ts
git commit -m "feat(db): add trigger_messages migration"
```

---

### Task 2: Запросы `trigger-messages.ts`

**Files:**
- Create: `src/database/queries/trigger-messages.ts`
- Test: `tests/database/queries/trigger-messages.test.ts` (только типы/сборка query-текста — без реальной БД; см. ниже)

> Реальную БД в юнит-тестах не трогаем (как и в остальном проекте). Этот модуль покрывается косвенно через `resolveIntents` (Task 5). Здесь только реализация + typecheck.

- [ ] **Step 1: Реализация**

```ts
import { Driver, TypedValues } from 'ydb-sdk'

export interface TriggerMessageRow {
  chat_id: number
  message_id: number
  author_id: number
  occurred_at: Date
}

async function drain(execResult: {
  resultSets: AsyncGenerator<{ rows: AsyncGenerator<Record<string, unknown>, void> }>
  opFinished: Promise<void>
}): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for await (const rs of execResult.resultSets) {
    for await (const row of rs.rows) all.push(row)
  }
  await execResult.opFinished
  return all
}

export async function upsertTriggerMessage(driver: Driver, row: TriggerMessageRow): Promise<void> {
  await driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $chat_id AS Int64;
          DECLARE $message_id AS Int64;
          DECLARE $author_id AS Uint64;
          DECLARE $occurred_at AS Timestamp;
          UPSERT INTO trigger_messages (chat_id, message_id, author_id, occurred_at)
          VALUES ($chat_id, $message_id, $author_id, $occurred_at);
        `,
        parameters: {
          $chat_id: TypedValues.int64(row.chat_id),
          $message_id: TypedValues.int64(row.message_id),
          $author_id: TypedValues.uint64(row.author_id),
          $occurred_at: TypedValues.timestamp(row.occurred_at),
        },
      })
      await res.opFinished
    },
  })
}

export async function findTriggerMessage(
  driver: Driver,
  chatId: number,
  messageId: number,
): Promise<{ author_id: number } | null> {
  return driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $chat_id AS Int64;
          DECLARE $message_id AS Int64;
          SELECT author_id FROM trigger_messages
          WHERE chat_id = $chat_id AND message_id = $message_id;
        `,
        parameters: {
          $chat_id: TypedValues.int64(chatId),
          $message_id: TypedValues.int64(messageId),
        },
      })
      const rows = await drain(res)
      const first = rows[0]
      if (!first) return null // (tsconfig: noUncheckedIndexedAccess — нельзя rows[0].x без проверки)
      return { author_id: Number(first.authorId) }
    },
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/database/queries/trigger-messages.ts
git commit -m "feat(db): trigger_messages upsert + point-lookup queries"
```

---

### Task 3: Select-запросы за период (telegram + teamly) и обновление типа события

**Files:**
- Modify: `src/database/queries/telegram-events.ts` (тип `TelegramEventType` + `selectEventsForPeriod`)
- Modify: `src/database/queries/teamly-events.ts` (`selectEventsForPeriod`)

- [ ] **Step 1: Обновить `TelegramEventType` и добавить select в `telegram-events.ts`**

Заменить строку типа:
```ts
export type TelegramEventType = 'trigger_reply' | 'trigger_reaction'
```

Добавить (в конец файла) helper `drain` (скопировать из `employees.ts`) и:
```ts
export async function selectEventsForPeriod(
  driver: Driver,
  fromUtc: Date,
  toUtc: Date,
): Promise<TelegramEventRow[]> {
  return driver.queryClient.do({
    timeout: 30_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $from AS Timestamp;
          DECLARE $to AS Timestamp;
          SELECT event_id, employee_id, chat_id, event_type, occurred_at, payload
          FROM telegram_events
          WHERE occurred_at >= $from AND occurred_at < $to
            AND event_type IN ('trigger_reply', 'trigger_reaction');
        `,
        parameters: {
          $from: TypedValues.timestamp(fromUtc),
          $to: TypedValues.timestamp(toUtc),
        },
      })
      const rows = await drain(res)
      return rows.map((r) => ({
        event_id: r.eventId as string,
        employee_id: Number(r.employeeId),
        chat_id: Number(r.chatId),
        event_type: r.eventType as TelegramEventType,
        occurred_at: r.occurredAt as Date,
        payload: JSON.parse(r.payload as string) as Record<string, unknown>,
      }))
    },
  })
}
```

- [ ] **Step 2: Добавить select в `teamly-events.ts`**

`teamly-events.ts` уже имеет тип `TeamlyEventType = 'article_create' | 'comment_create'`. Добавить helper `drain` и:
```ts
export async function selectEventsForPeriod(
  driver: Driver,
  fromUtc: Date,
  toUtc: Date,
): Promise<Pick<TeamlyEventRow, 'employee_id' | 'event_type'>[]> {
  return driver.queryClient.do({
    timeout: 30_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $from AS Timestamp;
          DECLARE $to AS Timestamp;
          SELECT employee_id, event_type
          FROM teamly_events
          WHERE occurred_at >= $from AND occurred_at < $to;
        `,
        parameters: {
          $from: TypedValues.timestamp(fromUtc),
          $to: TypedValues.timestamp(toUtc),
        },
      })
      const rows = await drain(res)
      return rows.map((r) => ({
        employee_id: Number(r.employeeId),
        event_type: r.eventType as TeamlyEventType,
      }))
    },
  })
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: FAIL — `event-builder.ts` ещё ссылается на `'message'`/`'reaction'`. Это ожидаемо; чиним в Chunk 2. (Если хочется зелёный typecheck покоммитно — выполнять Task 3 и Chunk 2 в одной ветке и коммитить после Task 5.)

- [ ] **Step 4: Commit**

```bash
git add src/database/queries/telegram-events.ts src/database/queries/teamly-events.ts
git commit -m "feat(db): period-select queries + narrow TelegramEventType to trigger_*"
```

---

## Chunk 2: Переписывание сбора (intents + матчинг)

### Task 4: Чистая функция `buildIntents`

**Files:**
- Modify: `src/sources/telegram/event-builder.ts` (полная замена логики; `EventInput` оставить как есть)
- Test: `tests/sources/telegram/event-builder.test.ts` (переписать)

- [ ] **Step 1: Переписать тест под `buildIntents`**

Заменить содержимое `tests/sources/telegram/event-builder.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildIntents, type EventInput } from '../../../src/sources/telegram/event-builder.js'

const SB = 6300594719
const SB2 = 7924502831
const EXT = 1234567
const CHAT = -1001234
const D = new Date('2026-05-27T10:00:00Z')
const isSb = (id: number) => id === SB || id === SB2

describe('buildIntents', () => {
  it('внешнее сообщение → trigger_message', () => {
    const input: EventInput = { kind: 'message', chatId: CHAT, messageId: 10, fromId: EXT, date: D, replyToMessageId: undefined, replyToUserId: undefined, text: 'hi' }
    expect(buildIntents(input, { isSbEmployee: isSb })).toEqual([
      { kind: 'trigger_message', chatId: CHAT, messageId: 10, authorId: EXT, date: D },
    ])
  })

  it('обычное сообщение сотрудника (не reply) → []', () => {
    const input: EventInput = { kind: 'message', chatId: CHAT, messageId: 10, fromId: SB, date: D, replyToMessageId: undefined, replyToUserId: undefined, text: 'hi' }
    expect(buildIntents(input, { isSbEmployee: isSb })).toEqual([])
  })

  it('reply сотрудника на внешнее → trigger_message(внешнего) + trigger_reply', () => {
    const input: EventInput = { kind: 'message', chatId: CHAT, messageId: 11, fromId: SB, date: D, replyToMessageId: 9, replyToUserId: EXT, text: 'r' }
    const out = buildIntents(input, { isSbEmployee: isSb })
    expect(out).toContainEqual({ kind: 'trigger_message', chatId: CHAT, messageId: 9, authorId: EXT, date: D })
    expect(out).toContainEqual({ kind: 'trigger_reply', chatId: CHAT, messageId: 11, fromId: SB, replyToMessageId: 9, replyToUserId: EXT, date: D })
  })

  it('reply сотрудника на сотрудника → []', () => {
    const input: EventInput = { kind: 'message', chatId: CHAT, messageId: 12, fromId: SB, date: D, replyToMessageId: 9, replyToUserId: SB2, text: 'r' }
    expect(buildIntents(input, { isSbEmployee: isSb })).toEqual([])
  })

  it('реакция сотрудника → reaction_candidate', () => {
    const input: EventInput = { kind: 'reaction', chatId: CHAT, messageId: 20, fromId: SB, date: D, emoji: '👍' }
    expect(buildIntents(input, { isSbEmployee: isSb })).toEqual([
      { kind: 'reaction_candidate', chatId: CHAT, messageId: 20, fromId: SB, emoji: '👍', date: D },
    ])
  })

  it('реакция не-сотрудника → []', () => {
    const input: EventInput = { kind: 'reaction', chatId: CHAT, messageId: 20, fromId: EXT, date: D, emoji: '👍' }
    expect(buildIntents(input, { isSbEmployee: isSb })).toEqual([])
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -- event-builder`
Expected: FAIL (`buildIntents` не существует).

- [ ] **Step 3: Реализовать `buildIntents`**

Полностью заменить `src/sources/telegram/event-builder.ts`:
```ts
export type EventInput =
  | {
      kind: 'message'
      chatId: number
      messageId: number
      fromId: number
      date: Date
      replyToMessageId: number | undefined
      replyToUserId: number | undefined
      text: string | undefined
    }
  | {
      kind: 'reaction'
      chatId: number
      messageId: number
      fromId: number
      date: Date
      emoji: string
    }

export type EventIntent =
  | { kind: 'trigger_message'; chatId: number; messageId: number; authorId: number; date: Date }
  | {
      kind: 'trigger_reply'
      chatId: number
      messageId: number
      fromId: number
      replyToMessageId: number
      replyToUserId: number
      date: Date
    }
  | { kind: 'reaction_candidate'; chatId: number; messageId: number; fromId: number; emoji: string; date: Date }

export interface BuildDeps {
  isSbEmployee: (telegramId: number) => boolean
}

export function buildIntents(input: EventInput, deps: BuildDeps): EventIntent[] {
  if (input.kind === 'reaction') {
    if (!deps.isSbEmployee(input.fromId)) return []
    return [
      { kind: 'reaction_candidate', chatId: input.chatId, messageId: input.messageId, fromId: input.fromId, emoji: input.emoji, date: input.date },
    ]
  }

  // kind === 'message'
  if (!deps.isSbEmployee(input.fromId)) {
    // внешнее сообщение — потенциальный триггер
    return [{ kind: 'trigger_message', chatId: input.chatId, messageId: input.messageId, authorId: input.fromId, date: input.date }]
  }

  // сообщение сотрудника: считаем только reply на внешнее
  const isTriggerReply =
    input.replyToMessageId !== undefined &&
    input.replyToUserId !== undefined &&
    !deps.isSbEmployee(input.replyToUserId)
  if (!isTriggerReply) return []

  return [
    { kind: 'trigger_message', chatId: input.chatId, messageId: input.replyToMessageId!, authorId: input.replyToUserId!, date: input.date },
    { kind: 'trigger_reply', chatId: input.chatId, messageId: input.messageId, fromId: input.fromId, replyToMessageId: input.replyToMessageId!, replyToUserId: input.replyToUserId!, date: input.date },
  ]
}
```

- [ ] **Step 4: Запустить — зелёно**

Run: `npm test -- event-builder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sources/telegram/event-builder.ts tests/sources/telegram/event-builder.test.ts
git commit -m "feat(telegram): buildIntents pure classifier (trigger-based)"
```

---

### Task 5: `resolveIntents` (матчинг реакций) + строки БД

**Files:**
- Modify: `src/sources/telegram/event-builder.ts` (добавить `resolveIntents`)
- Test: `tests/sources/telegram/resolve-intents.test.ts`

- [ ] **Step 1: Тест**

`tests/sources/telegram/resolve-intents.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveIntents, type EventIntent } from '../../../src/sources/telegram/event-builder.js'

const CHAT = -1001234
const SB = 6300594719
const EXT = 1234567
const D = new Date('2026-05-27T10:00:00Z')

describe('resolveIntents', () => {
  it('trigger_message → строка trigger_messages', async () => {
    const intents: EventIntent[] = [{ kind: 'trigger_message', chatId: CHAT, messageId: 9, authorId: EXT, date: D }]
    const out = await resolveIntents(intents, { findTriggerMessage: async () => null })
    expect(out.triggerMessages).toEqual([{ chat_id: CHAT, message_id: 9, author_id: EXT, occurred_at: D }])
    expect(out.events).toEqual([])
  })

  it('trigger_reply → событие trigger_reply', async () => {
    const intents: EventIntent[] = [{ kind: 'trigger_reply', chatId: CHAT, messageId: 11, fromId: SB, replyToMessageId: 9, replyToUserId: EXT, date: D }]
    const out = await resolveIntents(intents, { findTriggerMessage: async () => null })
    expect(out.events).toHaveLength(1)
    expect(out.events[0]).toMatchObject({
      event_id: `tg:${CHAT}:11:trigger_reply`,
      employee_id: SB,
      chat_id: CHAT,
      event_type: 'trigger_reply',
      payload: { reply_to_message_id: 9, reply_to_user_id: EXT },
    })
  })

  it('reaction_candidate + матч → событие trigger_reaction', async () => {
    const intents: EventIntent[] = [{ kind: 'reaction_candidate', chatId: CHAT, messageId: 9, fromId: SB, emoji: '👍', date: D }]
    const out = await resolveIntents(intents, { findTriggerMessage: async () => ({ author_id: EXT }) })
    expect(out.events).toHaveLength(1)
    expect(out.events[0]).toMatchObject({
      event_id: `tg:${CHAT}:9:trigger_reaction:${SB}:👍`,
      employee_id: SB,
      event_type: 'trigger_reaction',
      payload: { trigger_message_id: 9, author_id: EXT },
    })
  })

  it('reaction_candidate без матча → ничего', async () => {
    const intents: EventIntent[] = [{ kind: 'reaction_candidate', chatId: CHAT, messageId: 9, fromId: SB, emoji: '👍', date: D }]
    const out = await resolveIntents(intents, { findTriggerMessage: async () => null })
    expect(out.events).toEqual([])
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -- resolve-intents`
Expected: FAIL (`resolveIntents` не существует).

- [ ] **Step 3: Реализовать `resolveIntents`**

Добавить в `src/sources/telegram/event-builder.ts` (импортнуть тип строки):
```ts
import type { TelegramEventRow } from '../../database/queries/telegram-events.js'
import type { TriggerMessageRow } from '../../database/queries/trigger-messages.js'

export interface ResolveDeps {
  findTriggerMessage: (chatId: number, messageId: number) => Promise<{ author_id: number } | null>
}

export async function resolveIntents(
  intents: EventIntent[],
  deps: ResolveDeps,
): Promise<{ triggerMessages: TriggerMessageRow[]; events: TelegramEventRow[] }> {
  const triggerMessages: TriggerMessageRow[] = []
  const events: TelegramEventRow[] = []

  for (const intent of intents) {
    if (intent.kind === 'trigger_message') {
      triggerMessages.push({ chat_id: intent.chatId, message_id: intent.messageId, author_id: intent.authorId, occurred_at: intent.date })
    } else if (intent.kind === 'trigger_reply') {
      events.push({
        event_id: `tg:${intent.chatId}:${intent.messageId}:trigger_reply`,
        employee_id: intent.fromId,
        chat_id: intent.chatId,
        event_type: 'trigger_reply',
        occurred_at: intent.date,
        payload: { reply_to_message_id: intent.replyToMessageId, reply_to_user_id: intent.replyToUserId },
      })
    } else {
      const trig = await deps.findTriggerMessage(intent.chatId, intent.messageId)
      if (!trig) continue
      events.push({
        event_id: `tg:${intent.chatId}:${intent.messageId}:trigger_reaction:${intent.fromId}:${intent.emoji}`,
        employee_id: intent.fromId,
        chat_id: intent.chatId,
        event_type: 'trigger_reaction',
        occurred_at: intent.date,
        payload: { trigger_message_id: intent.messageId, author_id: trig.author_id },
      })
    }
  }
  return { triggerMessages, events }
}
```

- [ ] **Step 4: Запустить — зелёно**

Run: `npm test -- resolve-intents`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sources/telegram/event-builder.ts tests/sources/telegram/resolve-intents.test.ts
git commit -m "feat(telegram): resolveIntents builds rows + matches reactions to triggers"
```

---

### Task 6: Проводка в `TelegramSource`

**Files:**
- Modify: `src/sources/telegram/telegram-source.ts`

- [ ] **Step 1: Обновить `handleIncomingEvent`**

Заменить тело файла (импорты + класс):
```ts
import { Driver } from 'ydb-sdk'
import { logger } from '../../logger.js'
import type { DataSource } from '../types.js'
import { insertEvent } from '../../database/queries/telegram-events.js'
import { upsertTriggerMessage, findTriggerMessage } from '../../database/queries/trigger-messages.js'
import { buildIntents, resolveIntents, type EventInput } from './event-builder.js'

export class TelegramSource implements DataSource {
  readonly name = 'telegram' as const

  constructor(
    private readonly driver: Driver,
    private readonly deps: {
      isSbEmployee: (id: number) => boolean
      isTriggerChat: (chatId: number) => Promise<boolean>
    },
  ) {}

  async init(): Promise<void> {}

  async handleIncomingEvent(input: EventInput): Promise<void> {
    const inTriggerChat = await this.deps.isTriggerChat(input.chatId)
    if (!inTriggerChat) return

    const intents = buildIntents(input, { isSbEmployee: this.deps.isSbEmployee })
    if (intents.length === 0) return

    const { triggerMessages, events } = await resolveIntents(intents, {
      findTriggerMessage: (chatId, messageId) => findTriggerMessage(this.driver, chatId, messageId),
    })

    for (const tm of triggerMessages) {
      try {
        await upsertTriggerMessage(this.driver, tm)
      } catch (err) {
        logger.error({ err, tm }, 'failed to upsert trigger message')
      }
    }
    for (const ev of events) {
      try {
        await insertEvent(this.driver, ev)
        logger.debug({ event: ev.event_type, employee: ev.employee_id, chat: ev.chat_id }, 'telegram event saved')
      } catch (err) {
        logger.error({ err, event: ev }, 'failed to insert telegram event')
      }
    }
  }
}
```

- [ ] **Step 2: Typecheck + полный прогон тестов**

Run: `npm run typecheck && npm test`
Expected: PASS (typecheck зелёный — `'message'`/`'reaction'` больше не используются нигде).

- [ ] **Step 3: Commit**

```bash
git add src/sources/telegram/telegram-source.ts
git commit -m "feat(telegram): wire intents pipeline into TelegramSource"
```

---

## Chunk 3: Период и агрегация (чистые функции)

### Task 7: Парсинг периода

**Files:**
- Create: `src/reports/period.ts`
- Test: `tests/reports/period.test.ts`

- [ ] **Step 1: Тест**

`tests/reports/period.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolvePeriod } from '../../src/reports/period.js'

describe('resolvePeriod month', () => {
  it('явный месяц → границы UTC, лейблы, имя файла', () => {
    const p = resolvePeriod('month', '2026-05')
    // 2026-05-01 00:00 МСК = 2026-04-30 21:00 UTC
    expect(p.from.toISOString()).toBe('2026-04-30T21:00:00.000Z')
    // 2026-06-01 00:00 МСК = 2026-05-31 21:00 UTC
    expect(p.to.toISOString()).toBe('2026-05-31T21:00:00.000Z')
    expect(p.sheetLabel).toBe('Май 2026')
    expect(p.rangeLabel).toBe('01.05.2026 — 31.05.2026')
    expect(p.fileName).toBe('СБ_отчёт_2026-05.xlsx')
  })

  it('невалидный месяц → бросает', () => {
    expect(() => resolvePeriod('month', '2026-13')).toThrow()
  })
})

describe('resolvePeriod week', () => {
  it('явная ISO-неделя → пн..вс, лейблы, имя файла', () => {
    const p = resolvePeriod('week', '2026-W21')
    // ISO неделя 21 2026: понедельник 2026-05-18
    expect(p.from.toISOString()).toBe('2026-05-17T21:00:00.000Z') // 18.05 00:00 МСК
    expect(p.to.toISOString()).toBe('2026-05-24T21:00:00.000Z') // 25.05 00:00 МСК
    expect(p.sheetLabel).toBe('Неделя 21 (18.05 — 24.05)')
    expect(p.fileName).toBe('СБ_отчёт_2026-W21.xlsx')
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -- period`
Expected: FAIL.

- [ ] **Step 3: Реализация**

`src/reports/period.ts`:
```ts
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export interface ResolvedPeriod {
  from: Date // UTC, включительно
  to: Date // UTC, исключительно
  sheetLabel: string // «Май 2026» / «Неделя 21 (18.05 — 24.05)»
  rangeLabel: string // «01.05.2026 — 31.05.2026»
  fileName: string
}

// МСК-настенное время (Y,M0,D,h) → момент UTC
function mskToUtc(y: number, m0: number, d: number, h = 0): Date {
  return new Date(Date.UTC(y, m0, d, h) - MSK_OFFSET_MS)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function nowMsk(): Date {
  return new Date(Date.now() + MSK_OFFSET_MS) // поля .getUTC* = МСК-настенные
}

// Понедельник ISO-недели как UTC-полночь (для арифметики недель)
function isoWeekMonday(year: number, week: number): Date {
  // 4 января всегда в 1-й ISO-неделе
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Dow = (jan4.getUTCDay() + 6) % 7 // 0=пн
  const week1Monday = new Date(jan4.getTime() - jan4Dow * 86400000)
  return new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000)
}

function isoWeekOf(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dow + 3) // четверг текущей недели
  const year = date.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Dow = (jan4.getUTCDay() + 6) % 7
  const week1Monday = new Date(jan4.getTime() - jan4Dow * 86400000)
  const week = Math.round((date.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1
  return { year, week }
}

export function resolvePeriod(kind: 'week' | 'month', arg?: string): ResolvedPeriod {
  if (kind === 'month') {
    let year: number, month1: number // month1 = 1..12
    if (arg) {
      const m = /^(\d{4})-(\d{2})$/.exec(arg)
      if (!m) throw new Error(`Неверный формат месяца: ${arg} (ожидается YYYY-MM)`)
      year = Number(m[1]); month1 = Number(m[2])
      if (month1 < 1 || month1 > 12) throw new Error(`Неверный месяц: ${arg}`)
    } else {
      const n = nowMsk(); year = n.getUTCFullYear(); month1 = n.getUTCMonth() + 1
    }
    const from = mskToUtc(year, month1 - 1, 1)
    const to = mskToUtc(month1 === 12 ? year + 1 : year, month1 === 12 ? 0 : month1, 1)
    const lastDay = new Date(Date.UTC(year, month1, 0)).getUTCDate()
    return {
      from, to,
      sheetLabel: `${MONTHS_RU[month1 - 1]} ${year}`,
      rangeLabel: `01.${pad2(month1)}.${year} — ${pad2(lastDay)}.${pad2(month1)}.${year}`,
      fileName: `СБ_отчёт_${year}-${pad2(month1)}.xlsx`,
    }
  }

  // week
  let year: number, week: number
  if (arg) {
    const m = /^(\d{4})-W(\d{2})$/.exec(arg)
    if (!m) throw new Error(`Неверный формат недели: ${arg} (ожидается YYYY-Www)`)
    year = Number(m[1]); week = Number(m[2])
    if (week < 1 || week > 53) throw new Error(`Неверная неделя: ${arg}`)
  } else {
    const w = isoWeekOf(nowMsk()); year = w.year; week = w.week
  }
  const monday = isoWeekMonday(year, week) // UTC-полночь понедельника (как «настенная» дата)
  const sunday = new Date(monday.getTime() + 6 * 86400000)
  const from = mskToUtc(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate())
  const to = mskToUtc(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 7)
  const fmt = (x: Date) => `${pad2(x.getUTCDate())}.${pad2(x.getUTCMonth() + 1)}`
  return {
    from, to,
    sheetLabel: `Неделя ${week} (${fmt(monday)} — ${fmt(sunday)})`,
    rangeLabel: `${fmt(monday)}.${monday.getUTCFullYear()} — ${fmt(sunday)}.${sunday.getUTCFullYear()}`,
    fileName: `СБ_отчёт_${year}-W${pad2(week)}.xlsx`,
  }
}
```

- [ ] **Step 4: Запустить — зелёно**

Run: `npm test -- period`
Expected: PASS. (Если тонкости ISO-недели не сойдутся — поправить ожидаемые значения по факту корректной ISO-логики, не ломая алгоритм.)

- [ ] **Step 5: Commit**

```bash
git add src/reports/period.ts tests/reports/period.test.ts
git commit -m "feat(reports): period parsing (month/ISO-week) with MSK boundaries"
```

---

### Task 8: Агрегация (чистая)

**Files:**
- Create: `src/reports/aggregate.ts`
- Test: `tests/reports/aggregate.test.ts`

- [ ] **Step 1: Тест**

`tests/reports/aggregate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildReportData } from '../../src/reports/aggregate.js'
import type { TelegramEventRow } from '../../src/database/queries/telegram-events.js'

const SB = 6300594719
const CHAT = -1001234
const D = new Date('2026-05-10T08:00:00Z')

function reply(id: number, trigId: number): TelegramEventRow {
  return { event_id: `r${id}`, employee_id: SB, chat_id: CHAT, event_type: 'trigger_reply', occurred_at: D, payload: { reply_to_message_id: trigId } }
}
function reaction(id: number, trigId: number): TelegramEventRow {
  return { event_id: `x${id}`, employee_id: SB, chat_id: CHAT, event_type: 'trigger_reaction', occurred_at: D, payload: { trigger_message_id: trigId } }
}

describe('buildReportData', () => {
  it('дедуп: ответ и реакция на один триггер → обработано 2, уникальных 1', () => {
    const data = buildReportData({
      telegram: [reply(1, 9), reaction(1, 9)],
      teamly: [{ employee_id: SB, event_type: 'article_create' }],
      employees: [{ telegram_id: SB, full_name: 'Ани', teamly_user_id: null, created_at: D }],
      chats: [{ chat_id: CHAT, title: 'Юрлица', added_at: D }],
    })
    const emp = data.employees[0]
    expect(emp.tg.handled).toBe(2)
    expect(emp.tg.unique).toBe(1)
    expect(emp.teamly.created).toBe(1)
    expect(emp.teamly.commented).toBe(0)
    expect(emp.perChat[0]).toMatchObject({ title: 'Юрлица', handled: 2, unique: 1 })
    expect(data.activeChats).toBe(1)
    expect(data.totals.handled).toBe(2)
  })

  it('игнорирует чаты не из trigger_chats', () => {
    const data = buildReportData({
      telegram: [{ ...reply(1, 9), chat_id: -999 }],
      teamly: [],
      employees: [{ telegram_id: SB, full_name: 'Ани', teamly_user_id: null, created_at: D }],
      chats: [{ chat_id: CHAT, title: 'Юрлица', added_at: D }],
    })
    expect(data.employees[0].perChat).toEqual([])
    expect(data.activeChats).toBe(0)
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -- aggregate`
Expected: FAIL.

- [ ] **Step 3: Реализация**

`src/reports/aggregate.ts`:
```ts
import type { TelegramEventRow } from '../database/queries/telegram-events.js'
import type { TeamlyEventType } from '../database/queries/teamly-events.js'
import type { SbEmployeeRow } from '../database/queries/employees.js'
import type { TriggerChatRow } from '../database/queries/trigger-chats.js'

export interface ChatStat { chat_id: number; title: string; handled: number; unique: number }
export interface EmployeeStat {
  telegram_id: number
  full_name: string
  tg: { handled: number; unique: number }
  teamly: { created: number; commented: number }
  perChat: ChatStat[]
}
export interface ReportData {
  employees: EmployeeStat[]
  totals: { handled: number; unique: number; created: number; commented: number }
  activeChats: number
  employeeCount: number
}

interface Input {
  telegram: TelegramEventRow[]
  teamly: { employee_id: number; event_type: TeamlyEventType }[]
  employees: SbEmployeeRow[]
  chats: TriggerChatRow[]
}

function triggerIdOf(row: TelegramEventRow): number | null {
  const p = row.payload as Record<string, unknown>
  const id = row.event_type === 'trigger_reply' ? p.reply_to_message_id : p.trigger_message_id
  return typeof id === 'number' ? id : null
}

export function buildReportData(input: Input): ReportData {
  const chatTitle = new Map(input.chats.map((c) => [c.chat_id, c.title]))
  const teamlyById = new Map<number, { created: number; commented: number }>()
  for (const e of input.teamly) {
    const acc = teamlyById.get(e.employee_id) ?? { created: 0, commented: 0 }
    if (e.event_type === 'article_create') acc.created++
    else if (e.event_type === 'comment_create') acc.commented++
    teamlyById.set(e.employee_id, acc)
  }

  const activeChatIds = new Set<number>()
  const employees: EmployeeStat[] = input.employees.map((emp) => {
    const rows = input.telegram.filter((r) => r.employee_id === emp.telegram_id && chatTitle.has(r.chat_id))
    const perChatMap = new Map<number, { handled: number; uniq: Set<number> }>()
    const empUniq = new Set<string>()
    for (const r of rows) {
      activeChatIds.add(r.chat_id)
      const c = perChatMap.get(r.chat_id) ?? { handled: 0, uniq: new Set<number>() }
      c.handled++
      const tid = triggerIdOf(r)
      if (tid !== null) { c.uniq.add(tid); empUniq.add(`${r.chat_id}:${tid}`) }
      perChatMap.set(r.chat_id, c)
    }
    const perChat: ChatStat[] = [...perChatMap.entries()].map(([chat_id, v]) => ({
      chat_id, title: chatTitle.get(chat_id)!, handled: v.handled, unique: v.uniq.size,
    }))
    const tg = { handled: perChat.reduce((s, c) => s + c.handled, 0), unique: empUniq.size }
    const teamly = teamlyById.get(emp.telegram_id) ?? { created: 0, commented: 0 }
    return { telegram_id: emp.telegram_id, full_name: emp.full_name, tg, teamly, perChat }
  })

  const totals = employees.reduce(
    (s, e) => ({ handled: s.handled + e.tg.handled, unique: s.unique + e.tg.unique, created: s.created + e.teamly.created, commented: s.commented + e.teamly.commented }),
    { handled: 0, unique: 0, created: 0, commented: 0 },
  )
  return { employees, totals, activeChats: activeChatIds.size, employeeCount: input.employees.length }
}
```

- [ ] **Step 4: Запустить — зелёно**

Run: `npm test -- aggregate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reports/aggregate.ts tests/reports/aggregate.test.ts
git commit -m "feat(reports): pure aggregation of trigger + teamly stats"
```

---

## Chunk 4: ExcelJS-воркбук и команда

### Task 9: Добавить зависимость `exceljs`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Установить**

Run: `npm install exceljs`
Expected: `exceljs` появилась в `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add exceljs dependency"
```

---

### Task 10: ReportBuilder (воркбук → Buffer)

**Files:**
- Create: `src/reports/builder.ts`
- Test: `tests/reports/builder.test.ts`

- [ ] **Step 1: Тест (читаем сгенерённый буфер обратно через ExcelJS)**

`tests/reports/builder.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildWorkbook } from '../../src/reports/builder.js'
import type { ReportData } from '../../src/reports/aggregate.js'

const data: ReportData = {
  employees: [
    { telegram_id: 1, full_name: 'Ани Тоноян', tg: { handled: 320, unique: 188 }, teamly: { created: 16, commented: 42 }, perChat: [{ chat_id: -1, title: 'Юрлица', handled: 271, unique: 139 }] },
    { telegram_id: 2, full_name: 'Светлана', tg: { handled: 430, unique: 168 }, teamly: { created: 22, commented: 47 }, perChat: [{ chat_id: -1, title: 'Юрлица', handled: 363, unique: 126 }] },
  ],
  totals: { handled: 750, unique: 356, created: 38, commented: 89 },
  activeChats: 1,
  employeeCount: 2,
}
const period = { sheetLabel: 'Май 2026', rangeLabel: '01.05.2026 — 31.05.2026', fileName: 'СБ_отчёт_2026-05.xlsx' }

describe('buildWorkbook', () => {
  it('создаёт 3 листа с нужными заголовками', async () => {
    const buf = await buildWorkbook(data, period)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as any)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['По чатам', 'По сотрудникам', 'Итоги'])
  })

  it('лист «По сотрудникам» содержит итог формулой и значения', async () => {
    const buf = await buildWorkbook(data, period)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as any)
    const ws = wb.getWorksheet('По сотрудникам')!
    const text = JSON.stringify(ws.getSheetValues())
    expect(text).toContain('Ани Тоноян')
    expect(text).toContain('320')
    // в строке «Итого» есть SUM-формула
    const hasSum = ws.getRows(1, ws.rowCount)!.some((r) =>
      r.values && JSON.stringify(r.values).includes('SUM'))
    expect(hasSum).toBe(true)
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -- builder`
Expected: FAIL (`buildWorkbook` не существует).

- [ ] **Step 3: Реализация**

`src/reports/builder.ts`:
```ts
import ExcelJS from 'exceljs'
import type { ReportData } from './aggregate.js'

interface PeriodMeta { sheetLabel: string; rangeLabel: string; fileName: string }

const PURPLE = 'FF5A3E85'
const PURPLE_EMP = 'FF6F4CA6'
const GREEN_SUB = 'FFD9F0D3'
const GREEN_FINAL = 'FF2F7D32'
const BLUE_TG = 'FFE3F0FB'
const GREEN_TM = 'FFE6F4E6'

function fill(cell: ExcelJS.Cell, argb: string, white = false): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  cell.font = { bold: true, color: white ? { argb: 'FFFFFFFF' } : undefined }
}

export async function buildWorkbook(data: ReportData, period: PeriodMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  // ── Лист 1: По чатам ──
  const s1 = wb.addWorksheet('По чатам')
  s1.addRow([`СБ — Активность по чатам · ${period.sheetLabel}`])
  s1.mergeCells('A1:C1')
  const head1 = s1.addRow(['Сотрудник / Чат', 'Обработано триггеров', 'Уникальные триггеры'])
  head1.eachCell((c) => fill(c, PURPLE, true))
  for (const emp of data.employees) {
    const er = s1.addRow([`👤 ${emp.full_name}`, '', ''])
    er.eachCell((c) => fill(c, PURPLE_EMP, true))
    for (const ch of emp.perChat) s1.addRow([ch.title, ch.handled, ch.unique])
    const sr = s1.addRow([`∑ Итого ${emp.full_name}`, emp.tg.handled, emp.tg.unique])
    sr.eachCell((c) => fill(c, GREEN_SUB))
  }
  const f1 = s1.addRow(['📊 ИТОГО', data.totals.handled, data.totals.unique])
  f1.eachCell((c) => fill(c, GREEN_FINAL, true))
  s1.columns.forEach((c) => (c.width = 26))

  // ── Лист 2: По сотрудникам ──
  const s2 = wb.addWorksheet('По сотрудникам')
  s2.addRow([`СБ — Сводка по сотрудникам · ${period.sheetLabel} (${period.rangeLabel})`])
  s2.mergeCells('A1:E1')
  const head2 = s2.addRow(['Сотрудник', 'TG: Обработано триггеров', 'TG: Уникальные триггеры', 'Teamly: Создал', 'Teamly: Комментариев'])
  head2.eachCell((c) => fill(c, PURPLE, true))
  const firstDataRow = s2.rowCount + 1
  for (const emp of data.employees) {
    const r = s2.addRow([emp.full_name, emp.tg.handled, emp.tg.unique, emp.teamly.created, emp.teamly.commented])
    fill2(r)
  }
  const lastDataRow = s2.rowCount
  const totalRow = s2.addRow([
    'Итого',
    { formula: `SUM(B${firstDataRow}:B${lastDataRow})` },
    { formula: `SUM(C${firstDataRow}:C${lastDataRow})` },
    { formula: `SUM(D${firstDataRow}:D${lastDataRow})` },
    { formula: `SUM(E${firstDataRow}:E${lastDataRow})` },
  ])
  totalRow.eachCell((c) => fill(c, GREEN_FINAL, true))
  s2.columns.forEach((c) => (c.width = 24))

  // ── Лист 3: Итоги ──
  const s3 = wb.addWorksheet('Итоги')
  s3.addRow([`СБ — Итоги периода · ${period.sheetLabel}`])
  s3.mergeCells('A1:B1')
  s3.addRow(['Период', period.rangeLabel])
  s3.addRow(['Сотрудников в работе', data.employeeCount])
  const tgHead = s3.addRow(['Telegram', '']); fill(tgHead.getCell(1), PURPLE, true)
  s3.addRow(['Обработано триггеров', data.totals.handled])
  s3.addRow(['Уникальных триггеров', data.totals.unique])
  s3.addRow(['Активных trigger-чатов', data.activeChats])
  const tmHead = s3.addRow(['Teamly', '']); fill(tmHead.getCell(1), PURPLE, true)
  s3.addRow(['Создано карточек', data.totals.created])
  s3.addRow(['Комментариев', data.totals.commented])
  s3.getColumn(1).width = 28; s3.getColumn(2).width = 26

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}

function fill2(row: ExcelJS.Row): void {
  row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_TG } }
  row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_TG } }
  row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_TM } }
  row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_TM } }
}
```

- [ ] **Step 4: Запустить — зелёно**

Run: `npm test -- builder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reports/builder.ts tests/reports/builder.test.ts
git commit -m "feat(reports): ExcelJS workbook builder (3 sheets, styling, SUM)"
```

---

### Task 11: Команда `/report`

**Files:**
- Modify: `src/bot/features/report.ts`

- [ ] **Step 1: Реализация**

Полностью заменить `src/bot/features/report.ts`:
```ts
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
```

> Проверить, что `hasBotAccess` экспортируется из `../filters.js` (в текущем стабе импорт именно такой).

- [ ] **Step 2: Typecheck + полный прогон тестов**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/bot/features/report.ts
git commit -m "feat(bot): implement /report week|month → Excel"
```

---

### Task 12: Финальная проверка

- [ ] **Step 1: Прогон всего**

Run: `npm run typecheck && npm test`
Expected: PASS, все тесты зелёные.

- [ ] **Step 2: Ручная проверка периода (опционально, без БД)**

Прогнать в голове/локально `resolvePeriod('month')` и `resolvePeriod('week')` без аргумента — не должны бросать.

- [ ] **Step 3: Sanity по плану**

Сверить, что покрыты все пункты спека §2–§9. Боевая проверка `/report` в Telegram — после деплоя на ВМ (отдельный спек), т.к. бот сейчас не запущен с реальной БД.

---

## Заметки по исполнению
- Typecheck станет зелёным только после Task 6 (Chunk 1 Task 3 временно ломает сборку — это отмечено). Если исполняем субагентами по одной задаче, держать Chunk 1 Task 3 + Chunk 2 в одном «логическом» прогоне.
- ExcelJS-цвета в формате `AARRGGBB` (alpha впереди) — отсюда префикс `FF`.
- Боевой `/report` end-to-end проверяется уже после деплоя; здесь — юнит/snapshot-уровень.

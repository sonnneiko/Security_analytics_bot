# Отчёт `/report` — Design

**Дата:** 2026-05-28
**Статус:** на ревью
**Связанные доки:** [2026-05-24 Security Analytics Bot](2026-05-24-security-analytics-bot-design.md), [2026-05-27 Teamly integration](2026-05-27-teamly-integration-design.md)

---

## 1. Контекст и цель

`/report` сейчас заглушка ([src/bot/features/report.ts](../../../src/bot/features/report.ts)). Задача — собрать рабочий Excel-отчёт по активности сотрудников СБ за неделю/месяц из уже накопленных данных в БД.

Сотрудник СБ в ЛС бота пишет `/report month` (или `week`) и получает `.xlsx`-файл.

Два уточнения относительно исходного дизайна (2026-05-24), которые меняют отчёт:
- **Teamly «Просмотрел» недоступно.** External API не отдаёт просмотры, источник переведён на event-stream (`teamly_events` с `article_create` / `comment_create`). Поэтому в отчёте только **Создал** и **Комментариев**.
- **Telegram-метрика — «триггеры», а не разрозненные ответы/реакции/сообщения.** Считаем обработку триггеров: ответ ИЛИ реакция на внешнее сообщение. Обычные сообщения в чат не считаются.

Деплой на ВМ — отдельный спек, вне этого документа.

## 2. Метрики

### Telegram (на сотрудника)
- **Обработано триггеров** = `count(trigger_reply) + count(trigger_reaction)` — сколько раз сотрудник отреагировал на внешние сообщения (ответом или эмодзи-реакцией).
- **Уникальные триггеры** = число *различных* внешних сообщений, которых коснулся. Ключ дедупа — `(chat_id, trigger_message_id)`, где `trigger_message_id` — это **raw Telegram `message_id` внешнего сообщения**. Он лежит в одном id-пространстве для обоих типов событий: у `trigger_reply` это `reply_to_message_id`, у `trigger_reaction` — целевой `message_id` реакции. Поэтому ответ и реакция на одно и то же внешнее сообщение дедуплицируются в 1 (см. §8).

«Триггер» = сообщение **не-сотрудника** в групп-чате. Обработка = ответ на него или реакция на него.

### Teamly (на сотрудника)
- **Создал** = `count(article_create)`.
- **Комментариев** = `count(comment_create)`.

## 3. Изменения в модели данных (YDB)

### Новая таблица `trigger_messages` (migration `006_trigger_messages`)
```sql
CREATE TABLE IF NOT EXISTS trigger_messages (
  chat_id      Int64,
  message_id   Int64,
  author_id    Uint64,
  occurred_at  Timestamp,
  PRIMARY KEY (chat_id, message_id)
)
```
Добавляется новым элементом в append-only список `MIGRATIONS` ([migrations.ts](../../../src/database/migrations.ts)). Хранит внешние (не-СБ) сообщения. Доступ — **только point-lookup по PK** `(chat_id, message_id)` при обработке реакции; диапазонных запросов по `occurred_at` нет (индекс не нужен). `occurred_at` хранится только для возможной будущей очистки/TTL, в отчёте не используется.

### `telegram_events` — типы событий
Было: `'message' | 'reaction' | 'trigger_reply'`. Стало: **`'trigger_reply' | 'trigger_reaction'`**.
- Плоский `message` перестаём писать — его никто не читает.
- `reaction` заменяется на `trigger_reaction` (только реакции, сматченные с триггером).
- TS-тип `TelegramEventType` ([telegram-events.ts:3](../../../src/database/queries/telegram-events.ts#L3)) обновляется с `'message' | 'reaction' | 'trigger_reply'` на `'trigger_reply' | 'trigger_reaction'` синхронно с `event-builder.ts`.

Схема таблицы `telegram_events` не меняется (дискриминатор `event_type` + `payload Json`).

**Greenfield / legacy-данные.** Бот ещё не задеплоен (деплой на ВМ — следующая фаза), поэтому реальных строк в `telegram_events` нет — миграции типов и бэкфилл не нужны. Тем не менее все запросы отчёта (§5) фильтруют `event_type IN ('trigger_reply','trigger_reaction')` — это защищает от случайных legacy `message`/`reaction`-строк (например, из dev-прогонов) и делает отчёт корректным независимо от истории.

## 4. Изменения в сборе

Ключевое ограничение для границ юнитов: матчинг реакции с триггером **требует чтения БД** (`trigger_messages`), поэтому он не может жить в чистой синхронной функции `buildEvents`. Разделяем ответственность так:

### `event-builder.ts` — чистая синхронная функция (без БД)
`buildEvents(input)` возвращает список **намерений** (intents), каждое — что записать, но без побочных эффектов:
- сообщение **не-сотрудника** в групп-чате → `{ kind: 'trigger_message', chatId, messageId, authorId, date }` (сейчас для не-СБ возвращается `[]` — [event-builder.ts:28](../../../src/sources/telegram/event-builder.ts#L28); меняем);
- сообщение **сотрудника** — reply на внешнее → `{ kind: 'trigger_reply', chatId, messageId, replyToMessageId, replyToUserId, date }` (как сейчас, [event-builder.ts:54](../../../src/sources/telegram/event-builder.ts#L54), но **без** параллельного `message`-намерения);
- реакция сотрудника → `{ kind: 'reaction_candidate', chatId, messageId, fromId, emoji, date }` — «кандидат», т.к. чистая функция не знает, триггер ли это.

Так все ветки **детерминированы и юнит-тестируемы без БД** (§9).

### `TelegramSource.handleIncomingEvent` — async, побочные эффекты (БД)
Принимает intents от `buildEvents` и материализует их:
- `trigger_message` → upsert в `trigger_messages`;
- `trigger_reply` → (а) upsert внешнего сообщения `(chatId, replyToMessageId, replyToUserId)` в `trigger_messages` для консистентности; `occurred_at` синтетической строки = `date` самого reply (точная дата исходного сообщения недоступна, в отчёте не используется); (б) insert `telegram_events` `trigger_reply`, `payload {reply_to_message_id, reply_to_user_id}`;
- `reaction_candidate` → point-lookup `(chatId, messageId)` в `trigger_messages` через инъектированный `deps.findTriggerMessage(chatId, messageId)`:
  - найдено → insert `telegram_events` `trigger_reaction`, `payload {trigger_message_id: messageId, author_id}` (где `author_id` = автор триггера из `trigger_messages`);
  - не найдено → игнор (реакция на коллегу / на сообщение до старта сбора).

Зависимость `findTriggerMessage` инъектируется → логику матчинга можно тестировать без реальной БД.

`event_id` остаётся идемпотентным; `emoji` входит **в ключ идемпотентности**, а не в payload (разные эмодзи на одно сообщение = разные события):
- `tg:{chat_id}:{message_id}:trigger_reply`
- `tg:{chat_id}:{message_id}:trigger_reaction:{from_id}:{emoji}`

Реакции на сообщения, отправленные до старта сбора, не сматчатся — собираем только вперёд.

## 5. Запросы (`src/database/queries/`)

Все за полуинтервал периода `[from, to)`.

**Механизм.** Агрегаты с `distinct` по полю внутри `payload Json` неудобно считать на стороне YDB. Поэтому, как и в существующих query-файлах, запрос **выбирает строки** за период (фильтр по `occurred_at` через индекс `idx_employee_time` и по `event_type IN ('trigger_reply','trigger_reaction')`), `drain()`-ит результат, парсит `payload`, а группировку/`count`/`distinct` делает в TS. Объём мал (2 сотрудника × неделя/месяц) — in-memory агрегация безопасна.

- **TG на (сотрудник × чат):** из выбранных строк группируем по `(employee_id, chat_id)` → `обработано = count(строк)`, `уникальные = size(set of (chat_id, trigger_message_id))`, где `trigger_message_id` = `payload.reply_to_message_id` (для `trigger_reply`) или `payload.trigger_message_id` (для `trigger_reaction`). Для листа 1.
- **TG на сотрудника:** агрегат предыдущего по `employee_id`. Для листа 2 и итогов.
- **Teamly на сотрудника:** выбираем строки `teamly_events` за период, считаем в TS `created = count(event_type='article_create')`, `commented = count(event_type='comment_create')` по `employee_id`.
- **Активных trigger-чатов:** число различных `chat_id` среди TG-строк периода, пересечённое с `trigger_chats` (источник правды для названий чатов). Считается из тех же выбранных строк — отдельного скана `trigger_messages` нет.

Период в МСК; `occurred_at` в UTC — границы (`from`/`to`) конвертируются из МСК в UTC перед запросом. «Текущий» период для дефолта тоже вычисляется в МСК.

## 6. ReportBuilder (`src/reports/`)

ExcelJS, три листа (порядок: детали → свод → итог), формат из утверждённого макета.

### Лист 1 «По чатам Telegram»
Шапка `СБ — Активность по чатам · {Период}`. Группировка по сотруднику, чаты внутри, «∑ Итого {имя}», финальный «📊 ИТОГО». Колонки: `Сотрудник / Чат | Обработано триггеров | Уникальные триггеры`. В отчёт попадают только чаты из `trigger_chats` (для названий); прочие игнорируются.

### Лист 2 «По сотрудникам»
Шапка `СБ — Сводка по сотрудникам · {Период} ({from} — {to})`. Колонки: `Сотрудник | TG: Обработано триггеров | TG: Уникальные триггеры | Teamly: Создал | Teamly: Комментариев` + строка «Итого». TG-колонки светло-синие, Teamly — светло-зелёные.

### Лист 3 «Итоги»
Шапка `СБ — Итоги периода · {Период}`. Блок Telegram (Обработано, Уникальных, Активных trigger-чатов) и блок Teamly (Создано карточек, Комментариев) + период и число сотрудников.

### Оформление
- Фиолетовая шапка таблицы/разделитель сотрудника (`#5a3e85` / `#6f4ca6`), светло-зелёные «итого по сотруднику» (`#d9f0d3`), тёмно-зелёный финал (`#2f7d32`), TG `#e3f0fb`, Teamly `#e6f4e6`.
- Итоговые строки — формулами `=SUM(...)`, не статикой, чтобы фильтр пересчитывал.

### Имена файлов
- Месяц → `СБ_отчёт_2026-05.xlsx`, шапка `· Май 2026`.
- Неделя → `СБ_отчёт_2026-W21.xlsx`, шапка `· Неделя 21 (18.05 — 24.05)`.

## 7. Команда `/report`

- `/report month [YYYY-MM]` — Excel за месяц (по умолчанию текущий).
- `/report week [YYYY-Www]` — Excel за неделю (по умолчанию текущая, ISO-неделя).
- Поток: `hasBotAccess(ctx)` → парс периода → запросы → `ReportBuilder.build(period)` → отправка файла вызвавшему в ЛС.
- **Проводка/DI:** `registerReport` сейчас не имеет доступа к БД — только `hasBotAccess`. Драйвер YDB прокидывается в команду через `ctx.deps` (там же, где уже лежит `telegramSource` — [bot/context.ts](../../../src/bot/context.ts)). `ReportBuilder` берёт `driver` и query-функции. Файл отправляется через grammY: `ctx.replyWithDocument(new InputFile(buffer, filename))`.
- **Без обращения к Teamly API** — данные уже в `teamly_events` (webhook). Отчёт строится только из БД → быстрый, без расхода квоты API.

**Зависимости:** добавить `exceljs` в `package.json` (сейчас в `src/` не используется). `ReportBuilder.build(period)` возвращает `Buffer` (через `workbook.xlsx.writeBuffer()`) — совместимо с `new InputFile(buffer, filename)` grammY. Парсинг ISO-недель — через `date-fns` или собственную небольшую реализацию.

## 8. Граничные случаи

- **Нет данных за период** → файл с полной структурой и нулями (не текст «нет данных»).
- **Реакции до старта сбора** не матчатся — только вперёд.
- **Сотрудник и ответил, и среагировал на один триггер** → обработано = 2, уникальных = 1.
- **Невалидный аргумент периода** (`/report month 2026-13`) → понятное сообщение об ошибке формата.

## 9. Тесты

- Юнит на `event-builder` (чистая функция): intent `trigger_message` для внешнего сообщения, `trigger_reply` без `message`, `reaction_candidate` для реакции.
- Юнит на матчинг в `TelegramSource.handleIncomingEvent` с моком `findTriggerMessage`: hit → пишется `trigger_reaction`; miss → ничего не пишется.
- Snapshot-тест `ReportBuilder` на мок-данных: структура листов, ключевые ячейки, наличие `SUM`-формул в итоговых строках, имена файлов для week/month, корректный дедуп уникальных триггеров (ответ + реакция на один триггер = 1).

## 10. Что НЕ делаем (вне скоупа)

- ❌ Колонки «Сообщений», «Реакций» отдельно, «Просмотрел» (Teamly).
- ❌ Хранение всех сообщений подряд (только внешние — в `trigger_messages`).
- ❌ Обращение к Teamly API в момент `/report`.
- ❌ Автоматическая рассылка отчётов по cron — только on-demand.
- ❌ Деплой на ВМ — отдельный спек.

## 11. Открытые вопросы

Нет — все решения приняты в брейнсторме 2026-05-28.

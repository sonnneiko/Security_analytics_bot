# Security Analytics Bot — Design

**Дата:** 2026-05-24
**Статус:** утверждён к имплементации
**Референсный проект:** [work_analyst](https://github.com/sonnneiko/work_analyst) (@analyst_unit_bot)

---

## 1. Контекст и цель

Создать Telegram-бот для сбора статистики работы службы безопасности (СБ) компании. На старте — 2 сотрудника СБ:

- **Ани Тоноян**
- **Светлана Григорьева**

Бот собирает их активность из двух источников и по запросу строит Excel-отчёт за выбранную неделю или месяц. Прямой пользовательский сценарий: сотрудник СБ заходит в ЛС бота, пишет `/report month`, получает файл.

В дальнейшем (phase 2) добавляется источник «корпоративная почта Mail.ru» — личные ящики сотрудников + два общих ящика СБ.

## 2. Источники данных

### 2.1 Telegram (trigger-чаты СБ)
Аналог механики `work_analyst`. Бот сидит в «триггерных» чатах (например, «Юрлица СБ», «Платежи СБ»). Для каждого сотрудника СБ считается:
- сообщения,
- эмодзи-реакции,
- ответы (reply) на «триггерные» сообщения, т. е. сообщения от внешних участников чата.

### 2.2 Teamly
Teamly — корпоративная вики/база знаний, в которой СБ работает с «карточками» (страницы в специальном пространстве). Каждая карточка — заявка/обращение (пример заголовка: «698334 / 445197 belmash.shop Т-банк увеличение лимитов», статус «В работе СБ», автор, комментарии).

Teamly уже сам ведёт по каждому сотруднику базовую статистику (на скрине профиля видно «Посмотрел 458; Создал 45»). Бот **дёргает готовые агрегаты через Teamly External API** и сохраняет их у себя ежедневным снимком — этого достаточно. Метрики:
- создано карточек,
- просмотрено карточек,
- оставлено комментариев.

Webhook-механизм у Teamly есть, но в MVP **не используется** — он нужен был бы для отслеживания статусов/времени реакции, которые из скоупа исключены.

### 2.3 Mail.ru (phase 2)
Личные ящики сотрудников + 2 общих ящика. Доступ — IMAP с app-паролем (OAuth2 для IMAP у mail.ru не поддерживается). В MVP только заложена пустая структура (`src/sources/mail/.gitkeep`), реальная имплементация позже.

## 3. Архитектура

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Security_analytics_bot                          │
│                                                                       │
│  ┌─────────────────────────────┐   ┌─────────────────────────────┐  │
│  │  HTTP Server (Hono)         │   │  Background Workers         │  │
│  │  └─ POST /telegram/webhook  │   │  └─ Scheduler (node-cron)   │  │
│  └──────────────┬──────────────┘   │     └─ daily Teamly snapshot│  │
│                 │                   └──────────────┬──────────────┘  │
│                 ▼                                  ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │                  Sources Layer (DataSource)                      ││
│  │  ┌──────────────────┐  ┌─────────────────┐  ┌──────────────┐    ││
│  │  │ TelegramSource   │  │ TeamlySource    │  │ MailSource   │    ││
│  │  │ (grammY adapter) │  │ (REST aggregates)│ │ (phase 2)    │    ││
│  │  └────────┬─────────┘  └────────┬────────┘  └──────┬───────┘    ││
│  └───────────┼─────────────────────┼──────────────────┼────────────┘│
│              ▼                     ▼                  ▼             │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                        Storage (YDB)                           │ │
│  │   sb_employees · trigger_chats · telegram_events · teamly_daily_stats │
│  └────────────────────────────┬───────────────────────────────────┘ │
│                               ▼                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Report Builder (ExcelJS) — only on /report        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│              ┌────────────────────────────┐                         │
│              │  Telegram Bot (grammY)     │                         │
│              │  ЛС с сотрудниками СБ      │                         │
│              └────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────────────┘
```

### Потоки данных
1. **Telegram-обновление** → Hono `/telegram/webhook` → grammY middleware → `stats-collector.ts` → `TelegramSource.handleIncomingEvent()` → запись в `telegram_events`.
2. **Cron «daily Teamly snapshot»** (~23:50 МСК) → `TeamlySource.ensureFreshSnapshot(today)` → для каждого `sb_employees.teamly_user_id` дёргает Teamly REST API → upsert строки в `teamly_daily_stats` за `date=today`.
3. **`/report`** → бот вызывает `TeamlySource.ensureFreshSnapshot(today)` для свежести → `ReportBuilder.build(period)` → читает `telegram_events` + `teamly_daily_stats` → собирает Excel → отправляет файл в ЛС вызвавшему.

### Ключевые архитектурные решения и причины
- **Слой `DataSource`** с явным интерфейсом — изолирует источники друг от друга, упрощает добавление Mail в phase 2, делает тестируемым.
- **Асимметрия источников: events vs snapshots.** Telegram-данные приходят событиями реального времени → храним как event-stream (`telegram_events`). Teamly-данные приходят готовыми агрегатами → храним снимками по дням (`teamly_daily_stats`). Попытка унифицировать привела бы к фейковым «событиям» при поллинге Teamly — лишний шум.
- **Только webhook-режим на проде.** Polling используется только в dev. Webhook нужен и под Telegram, и под будущие задачи (например, опционально включить Teamly webhooks в phase 2).
- **Все права у всех `sb_employees`.** Команда из 2 человек, разделение на админов/супер-админов — избыточный код, который усложняет без пользы.
- **Отдельная роль `bot_admin` (ENV `BOT_ADMINS`).** Тестер/владелец продукта (Соня) имеет полный доступ к командам, но **не попадает в статистику** — её события не пишутся в `telegram_events`, и она не фигурирует в отчётах. Реализация — простой список `telegram_id` в ENV, без таблицы и без `/add_admin` команд (роль стабильна).
- **Незарегистрированным бот отвечает «нет доступа + ваш Telegram ID: N».** Это даёт тестеру/новому сотруднику простой способ узнать свой ID для попадания в `BOT_ADMINS` или `INITIAL_SB_USERS` без отдельной команды `/whoami`.
- **Bootstrap через ENV `INITIAL_SB_USERS`** — решает «проблему первого запуска». Без неё некому добавить первого сотрудника через `/add_sb`.

## 4. Структура проекта

```
src/
  bot/
    features/
      welcome.ts                # /start в ЛС
      sb-management.ts          # /add_sb, /remove_sb, /list_sb
      trigger-chat-management.ts # /add_trigger_chat, /remove_trigger_chat, /list_trigger_chats
      stats-collector.ts        # фоновый сбор messages/reactions/replies → TelegramSource
      report.ts                 # /report [week|month] [period]
      unhandled.ts              # ВСЕГДА последняя
    filters/
      is-sb-employee.ts           # для сбора статистики
      has-bot-access.ts           # sb_employee OR bot_admin — для команд
    context.ts                  # кастомный Context
    index.ts                    # createBot() — middleware-стек

  sources/
    types.ts                    # interface DataSource
    telegram/
      telegram-source.ts        # реализация DataSource
      event-builder.ts          # grammY Update → telegram_events
    teamly/
      teamly-source.ts          # реализация DataSource
      teamly-client.ts          # HTTP-клиент с Bearer auth (fetch + типы)
      stats-fetcher.ts          # тянет агрегаты, пишет teamly_daily_stats
    mail/
      .gitkeep                  # phase 2

  database/
    index.ts                    # YDB-коннект + runMigrations()
    queries/
      employees.ts
      trigger-chats.ts
      telegram-events.ts
      teamly-stats.ts
    schema.sql                  # справочная схема (не выполняется)

  reports/
    builder.ts                  # ReportBuilder.build(period): Workbook
    sheets/
      by-chat.ts                # Лист 1: «По чатам Telegram»
      by-employee.ts            # Лист 2: «По сотрудникам»
      summary.ts                # Лист 3: «Итоги»

  server/
    index.ts                    # Hono app: POST /telegram/webhook

  scheduler.ts                  # cron-задача: daily Teamly snapshot
  config.ts                     # valibot config schema
  logger.ts                     # pino + pino-pretty
  main.ts                       # entry: migrate → bootstrap sb → init sources → scheduler → server/bot

locales/                        # Fluent .ftl, основной язык ru
docs/superpowers/specs/         # дизайн-доки
tests/
  reports/                      # snapshot-тесты Excel из мок-данных
  sources/                      # юнит-тесты event-builder и stats-fetcher
scripts/
  deploy-yandex.sh              # скопировать и адаптировать из work_analyst
```

### `DataSource` interface

```typescript
// src/sources/types.ts
interface DataSource {
  readonly name: 'telegram' | 'teamly' | 'mail'
  init(): Promise<void>
  // только TelegramSource реально использует (incoming events)
  handleIncomingEvent?(update: unknown): Promise<void>
  // только TeamlySource (и в phase 2 MailSource) — обновление снимка за период
  ensureFreshSnapshot?(period: DateRange): Promise<void>
}
```

## 5. Модель данных (YDB)

```sql
-- Сотрудники СБ (мэппинг между источниками)
sb_employees
  telegram_id      Uint64    PK
  teamly_user_id   Utf8?              -- ID пользователя в Teamly; заполняется при /add_sb
  mail_address     Utf8?              -- phase 2
  full_name        Utf8
  created_at       Timestamp

-- Trigger-чаты СБ (как в work_analyst.trigger_chats)
trigger_chats
  chat_id   Int64       PK
  title     Utf8                       -- название чата для отчёта
  added_at  Timestamp

-- Telegram-события (все три типа)
telegram_events
  event_id      Utf8       PK         -- "tg:{chat_id}:{message_id}:{type}" — идемпотентность
  employee_id   Uint64                -- FK → sb_employees.telegram_id
  chat_id       Int64
  event_type    Utf8                  -- 'message' | 'reaction' | 'trigger_reply'
  occurred_at   Timestamp
  payload       Json                  -- {emoji?, reply_to_message_id?, ...}
  INDEX idx_employee_time GLOBAL ON (employee_id, occurred_at)
  INDEX idx_chat_time     GLOBAL ON (chat_id, occurred_at)

-- Снимки агрегатов Teamly (пишутся cron + перед /report)
teamly_daily_stats
  employee_teamly_id  Utf8       PK col 1
  date                Date       PK col 2
  created             Uint32                  -- карточек создано в этот день
  viewed              Uint32                  -- просмотрено в этот день
  commented           Uint32                  -- комментариев в этот день
  fetched_at          Timestamp               -- когда последний раз обновляли строку
```

### Что НЕ хранится и почему
- ❌ Нет таблицы `admins` — все равны.
- ❌ Нет `am_messages`, `am_reactions`, `am_trigger_responses` как отдельных таблиц (работа_analyst делит так). У нас одна `telegram_events` с дискриминатором `event_type` — меньше JOIN'ов при построении отчёта.
- ❌ Нет `teamly_cards`, `teamly_card_status_history` — статусы и время в работе из скоупа MVP исключены.
- ❌ Нет `chat_alert_state` — silence-alerts удалены.
- ❌ Нет `am_ratings`, `feedback` — не применимо к СБ.

### План B для `teamly_daily_stats`
Если выяснится, что Teamly API не отдаёт цифры «за конкретный день», а только totals — храним totals и считаем суточные дельты между снимками. Структура таблицы это позволяет: достаточно переинтерпретировать поля и добавить ежедневный апдейт totals.

## 6. Команды бота

Все команды доступны пользователям из `sb_employees` **и** из `BOT_ADMINS`. Незарегистрированным бот отвечает: `Нет доступа. Ваш Telegram ID: {id}` — чтобы тестер/новый сотрудник мог попросить добавить себя.

**Важно:** статистика собирается только по `sb_employees`. События от `BOT_ADMINS` (например, Сони) в `telegram_events` не пишутся и в отчётах не фигурируют.

| Команда | Описание |
|---|---|
| `/start` | Приветствие в ЛС |
| `/report month [YYYY-MM]` | Excel за месяц (по умолчанию текущий) |
| `/report week [YYYY-Www]` | Excel за неделю (по умолчанию текущая) |
| `/add_sb <tg_id> <teamly_id> <ФИО>` | Регистрация нового сотрудника СБ |
| `/remove_sb <tg_id>` | Удаление сотрудника |
| `/list_sb` | Список зарегистрированных сотрудников |
| `/add_trigger_chat [chat_id]` | Без аргумента — текущий чат |
| `/remove_trigger_chat [chat_id]` | — |
| `/list_trigger_chats` | — |

## 7. Excel-отчёт

Формат и порядок листов: **детали → свод → общий итог**.

### Лист 1: «По чатам Telegram»
Группировка по сотруднику, чаты внутри, итого по сотруднику, общий итог в конце. Колонки `Ответов` и `Уник. триггеров` — как в work_analyst.

Шапка: `СБ — Активность по чатам · Май 2026`

| АМ / Чат | Ответов | Уник. триггеров |
|---|---|---|
| **👤 Ани Тоноян** | | |
| ⚠️ Юрлица Triggers | 276 | 139 |
| Действия партнеров | 49 | 49 |
| ∑ **Итого Ани** | **325** | **188** |
| **👤 Светлана Григорьева** | | |
| ⚠️ Юрлица Triggers | 351 | 126 |
| Payment terminals on/off | 67 | 42 |
| ∑ **Итого Светлана** | **418** | **168** |
| 📊 **ИТОГО ЗА МЕСЯЦ** | **743** | **356** |

Стили: фиолетовая шапка сотрудника, светло-зелёные «Итого по сотруднику», тёмно-зелёная финальная строка.

### Лист 2 (предпоследний): «По сотрудникам» — общая сводка
Шапка: `СБ — Сводка по сотрудникам · Май 2026 (01.05.2026 — 31.05.2026)`

| Сотрудник | TG: Ответов | TG: Уник. триггеров | TG: Реакций | Teamly: Создал | Teamly: Просмотрел | Teamly: Комментариев |
|---|---|---|---|---|---|---|
| Ани Тоноян | 325 | 188 | 36 | 16 | 635 | 42 |
| Светлана Григорьева | 418 | 168 | 31 | 22 | 612 | 47 |
| **Итого** | **743** | **356** | **67** | **38** | **1247** | **89** |

Стили: TG-колонки светло-синий фон, Teamly — светло-зелёный.

### Лист 3 (последний): «Итоги»
Шапка: `СБ — Итоги периода · Май 2026`

| | Значение |
|---|---|
| Период | 01.05.2026 — 31.05.2026 |
| Сотрудников в работе | 2 |
| **Telegram** | |
| Ответов всего | 743 |
| Уникальных триггеров | 356 |
| Реакций | 67 |
| Активных trigger-чатов | 5 |
| **Teamly** | |
| Создано карточек | 38 |
| Просмотрено карточек | 1,247 |
| Комментариев | 89 |

### Имена файлов
- месяц → `СБ_отчёт_2026-05.xlsx`, шапка `· Май 2026`
- неделя → `СБ_отчёт_2026-W21.xlsx`, шапка `· Неделя 21 (18.05 — 24.05)`

### Тонкие моменты
- Один и тот же шаблон листов — отличается только период и числа.
- «Уник. триггеров» = дедуплицированное `reply_to_message_id` в `telegram_events` за период (как в work_analyst).
- Итоговые строки — формулами Excel (`=SUM(...)`), не статикой, чтобы фильтр пересчитывал.

## 8. Scheduler

| Расписание (МСК) | Задача |
|---|---|
| `50 23 * * *` | `TeamlySource.ensureFreshSnapshot(today)` — обновить агрегаты за сегодняшний день для всех `sb_employees` |

Перед каждым вызовом `/report` тоже делается `ensureFreshSnapshot(today)` — отчёт всегда содержит свежие данные за сегодня.

Авто-рассылка отчётов по cron **не предусмотрена** — сотрудники сами вызывают `/report`, когда нужно.

## 9. Bootstrap первого запуска

ENV-переменная `INITIAL_SB_USERS` — JSON-массив:
```json
[
  {"telegram_id": 6300594719, "full_name": "Ани Тоноян", "teamly_user_id": "<TBD>"},
  {"telegram_id": 7924502831, "full_name": "Светлана Григорьева", "teamly_user_id": "<TBD>"}
]
```

На старте `main.ts` (после миграций) идёт по этому массиву и делает `INSERT ... ON CONFLICT DO NOTHING` в `sb_employees`. Дальше управление — через `/add_sb` и `/remove_sb`.

ENV-переменная `BOT_ADMINS` — JSON-массив telegram_id, у кого есть доступ к командам без сбора статистики:
```json
[<sonya_telegram_id>]
```
Соня узнаёт свой ID, написав боту любое сообщение — бот ответит «Нет доступа. Ваш Telegram ID: {id}», после чего ID добавляется в `BOT_ADMINS` и контейнер передеплоивается.

## 10. Стек и инфраструктура

| Слой | Технология |
|---|---|
| Runtime | Node.js ≥ 20, TypeScript |
| Telegram | grammY + плагины (i18n, hydrate, parse-mode, runner — последний только для dev polling) |
| HTTP | Hono |
| База | YDB (Yandex Cloud Serverless) — новая база, отдельно от work_analyst |
| Cron | node-cron |
| Excel | ExcelJS |
| Config | valibot |
| Logger | pino + pino-pretty |
| Деплой | Yandex Cloud Serverless Container, скрипт `scripts/deploy-yandex.sh` (скопировать из work_analyst и адаптировать) |
| Режим | webhook на проде, polling в dev |

### Новые зависимости по сравнению с work_analyst
- Никаких SDK для Teamly — простой `fetch` + типы.
- `date-fns` (или встроенная реализация) — для парсинга ISO-недель `YYYY-Www`.

### Yandex Cloud ресурсы (создаются отдельно от work_analyst)
- Serverless Container `security-analytics-bot`
- YDB-база `security-analytics-bot-db`
- Service account с правами на эту базу
- Secret для `BOT_TOKEN`
- Бот в @BotFather: **@UnitSecurity_analytics_bot** (telegram_id `8647183807`) — уже создан

## 11. ENV-переменные

| Переменная | Обязательная | Описание |
|---|---|---|
| `BOT_TOKEN` | да | Telegram bot token |
| `BOT_MODE` | да | `polling` или `webhook` |
| `BOT_WEBHOOK` | в webhook-режиме | Публичный URL для Telegram |
| `BOT_WEBHOOK_SECRET` | в webhook-режиме | Secret token |
| `YDB_ENDPOINT` | да | YDB endpoint |
| `YDB_DATABASE` | да | YDB database path |
| `YDB_SA_KEY_FILE` | да | Путь к service account ключу |
| `TEAMLY_API_BASE` | да | URL базы API (зависит от тенанта) |
| `TEAMLY_API_TOKEN` | да | Bearer-токен пользователя/сервиса |
| `INITIAL_SB_USERS` | да | JSON-массив сотрудников для bootstrap |
| `BOT_ADMINS` | нет | JSON-массив telegram_id с доступом к командам, но БЕЗ сбора статистики (тестеры/владельцы) |
| `SERVER_HOST` | webhook only | По умолчанию `0.0.0.0` |
| `SERVER_PORT` | webhook only | По умолчанию `80` |
| `LOG_LEVEL` | нет | По умолчанию `info` |
| `DEBUG` | нет | По умолчанию `false` |

## 12. Что НЕ делаем (явные исключения из скоупа)

- ❌ Silence-alerts (15-минутный таймер) — из work_analyst.
- ❌ Feedback / rating / merchant-чаты — не применимо к СБ.
- ❌ `/broadcast`, `/send_to` — мёртвый груз для команды из 2 человек.
- ❌ Админы и супер-админы — все `sb_employees` равны.
- ❌ Автоматическая рассылка отчётов по cron — только on-demand.
- ❌ Отслеживание статусов карточек Teamly и времени в работе.
- ❌ Webhook от Teamly — не нужны при готовых агрегатах.
- ❌ Лист «Teamly по дням» в Excel.
- ❌ Mail.ru в MVP — phase 2.

## 13. Открытые вопросы

### Ждут ответа (блокируют Teamly-часть)
1. **Тариф Teamly.** External API доступно только на платных тарифах Business/Enterprise. Подтвердить, что у тенанта API включён, и получить Bearer-токен. *(статус: ожидание)*
2. **Структура Teamly stats endpoint.** Отдаёт ли API цифры «за конкретный день» или только totals/за произвольный период? От ответа зависит реализация `stats-fetcher.ts` (план B заложен). *(зависит от п.1)*
3. **`teamly_user_id` для Ани и Светланы** — получим вместе с доступом к Teamly API.

### Решено
- ✅ **Бот:** `@UnitSecurity_analytics_bot`, telegram_id `8647183807`.
- ✅ **Telegram-ID сотрудников СБ:** Ани Тоноян — `6300594719`, Светлана Григорьева — `7924502831`.
- ✅ **Доступ владельца для тестов:** Соня — через `BOT_ADMINS` (telegram_id узнаётся ответом бота на её сообщение). Статистика по Соне **не собирается**.

## 14. План реализации (контур, детали — в writing-plans)

1. Скелет проекта: package.json, tsconfig, eslint, valibot config, pino, Hono — собрать на основе work_analyst.
2. YDB-коннект и `runMigrations()` для 4 таблиц.
3. Bootstrap `INITIAL_SB_USERS` в `main.ts`.
4. grammY-каркас, фильтр `isSbEmployee`, `welcome`, `sb-management`, `trigger-chat-management`.
5. `TelegramSource` + `stats-collector` (повторное использование логики work_analyst).
6. `TeamlySource` + `teamly-client` + `stats-fetcher`. Заглушка `ensureFreshSnapshot()` пока без реального API.
7. После получения доступа к Teamly API — реализация реальных запросов.
8. `ReportBuilder` с тремя листами. Snapshot-тесты на мок-данных.
9. Cron: daily Teamly snapshot.
10. `scripts/deploy-yandex.sh` — адаптация под новый контейнер и базу.
11. Прод-деплой, регистрация webhook в Telegram.

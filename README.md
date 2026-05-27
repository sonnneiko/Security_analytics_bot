# Security Analytics Bot

Telegram-бот для сбора статистики работы службы безопасности (СБ) компании и формирования Excel-отчётов за неделю или месяц по запросу.

**Бот:** [@UnitSecurity_analytics_bot](https://t.me/UnitSecurity_analytics_bot)
**Статус:** MVP Telegram готов (polling, событий пишутся в YDB). Excel-отчёт, Teamly и деплой — в плане 2.
**Дизайн-документ:** [docs/superpowers/specs/2026-05-24-security-analytics-bot-design.md](docs/superpowers/specs/2026-05-24-security-analytics-bot-design.md)
**План MVP:** [docs/superpowers/plans/2026-05-27-mvp-telegram.md](docs/superpowers/plans/2026-05-27-mvp-telegram.md)
**Референс:** [work_analyst](https://github.com/sonnneiko/work_analyst) (@analyst_unit_bot)

---

## Зачем

Сотрудники СБ работают одновременно в нескольких системах (Telegram-чаты, Teamly-вики, корпоративная почта). Раньше не было способа собрать единую картину их активности — кто сколько обработал заявок, ответил в чатах, создал карточек. Этот бот закрывает пробел: автоматически собирает события из всех источников и по команде `/report` отдаёт сводный Excel.

## Кого считаем

На старте — 2 сотрудника СБ:
- **Ани Тоноян** (telegram_id `6300594719`)
- **Светлана Григорьева** (telegram_id `7924502831`)

Сотрудники СБ добавляются/удаляются через команды бота. Прямой пользовательский сценарий: сотрудник заходит в ЛС бота → `/report month` → получает файл.

## Источники данных

| Источник | Что собираем | Как |
|---|---|---|
| **Telegram trigger-чаты** | сообщения, эмодзи-реакции, ответы (reply) на внешние сообщения | бот сидит в чатах, события приходят в реальном времени через webhook |
| **Teamly** (корпоративная вики) | создано / просмотрено / прокомментировано карточек | ежедневный snapshot готовых агрегатов через Teamly External API |
| **Mail.ru** *(phase 2)* | активность в личных + общих ящиках СБ | IMAP с app-паролем (в MVP только заглушка) |

## Архитектура (коротко)

```
Telegram → Hono webhook → grammY → TelegramSource → telegram_events (event-stream)
node-cron (23:50 МСК)   → TeamlySource   → teamly_daily_stats (snapshots)
/report → ReportBuilder → ExcelJS → файл в ЛС
```

Ключевые решения:
- **Слой `DataSource`** изолирует источники друг от друга — упрощает добавление Mail в phase 2.
- **Асимметрия хранения:** Telegram → events, Teamly → daily snapshots (Teamly отдаёт готовые агрегаты, фейковые «события» из поллинга были бы шумом).
- **Только webhook на проде**, polling — в dev.
- **Все `sb_employees` равны** — без админов/супер-админов внутри СБ.
- **Отдельная роль `BOT_ADMINS`** — у тестера/владельца (Соня) полный доступ к командам, но статистика по нему НЕ собирается.

Подробности и обоснования — в [дизайн-документе](docs/superpowers/specs/2026-05-24-security-analytics-bot-design.md).

## Команды бота

Все команды доступны пользователям из `sb_employees` и `BOT_ADMINS`. Незарегистрированным бот отвечает «Нет доступа. Ваш Telegram ID: N» — чтобы было видно ID для запроса доступа.

| Команда | Описание |
|---|---|
| `/start` | Приветствие в ЛС |
| `/report month [YYYY-MM]` | Excel-отчёт за месяц (по умолчанию текущий) |
| `/report week [YYYY-Www]` | Excel-отчёт за неделю (по умолчанию текущая) |
| `/add_sb <tg_id> <teamly_id> <ФИО>` | Регистрация нового сотрудника СБ |
| `/remove_sb <tg_id>` | Удаление сотрудника |
| `/list_sb` | Список зарегистрированных сотрудников |
| `/add_trigger_chat [chat_id]` | Без аргумента — текущий чат |
| `/remove_trigger_chat [chat_id]` | — |
| `/list_trigger_chats` | — |

## Excel-отчёт

Три листа: **детали → свод → общий итог**.

1. **«По чатам Telegram»** — группировка по сотруднику, чаты внутри, итого по сотруднику, общий итог.
2. **«По сотрудникам»** — сводная таблица: TG (ответы / уник. триггеры / реакции) + Teamly (создал / просмотрел / комментариев).
3. **«Итоги»** — одна сводная цифра по каждому показателю за период.

Имена файлов:
- месяц → `СБ_отчёт_2026-05.xlsx`
- неделя → `СБ_отчёт_2026-W21.xlsx`

## Стек

| Слой | Технология |
|---|---|
| Runtime | Node.js ≥ 20, TypeScript |
| Telegram | grammY (+ i18n, hydrate, parse-mode, runner для dev polling) |
| HTTP | Hono |
| База | YDB (Yandex Cloud Serverless) |
| Cron | node-cron |
| Excel | ExcelJS |
| Config | valibot |
| Logger | pino + pino-pretty |
| Деплой | Yandex Cloud Serverless Container |

## Запуск локально (MVP)

1. Скопировать `.env.example` → `.env` и заполнить:
   - `BOT_TOKEN` — из @BotFather
   - `YDB_*` — endpoint, database path, путь к SA-ключу (см. ниже)
   - `INITIAL_SB_USERS` — JSON-массив сотрудников
   - `BOT_ADMINS` — JSON-массив telegram_id с доступом без сбора статистики
2. Положить ключ сервисного аккаунта в `./secrets/ydb-sa-key.json` (директория в `.gitignore`).
3. `npm install`
4. `npm run dev` — поднимет бот в polling-режиме. На старте бот сам накатит миграции и забутстрапит `INITIAL_SB_USERS` в `sb_employees`.

Yandex Cloud-ресурсы для MVP уже подготовлены:
- YDB: `security-analytics-bot-db` (folder `vm-accounting`, id `etn5kgqrt24j7cvb0ea4`)
- Service account: `security-analytics-bot-sa` с ролью `ydb.editor` на этой базе

## ENV-переменные

| Переменная | Обязательная | Описание |
|---|---|---|
| `BOT_TOKEN` | да | Telegram bot token |
| `YDB_ENDPOINT` | да | YDB endpoint (например `grpcs://ydb.serverless.yandexcloud.net:2135`) |
| `YDB_DATABASE` | да | YDB database path (`/ru-central1/<cloud>/<db_id>`) |
| `YDB_SA_KEY_FILE` | да | Путь к service account ключу |
| `INITIAL_SB_USERS` | да | JSON-массив `{telegram_id, name, teamly_user_id?}` для bootstrap первого запуска |
| `BOT_ADMINS` | нет | JSON-массив telegram_id с доступом, но БЕЗ сбора статистики |
| `LOG_LEVEL` | нет | По умолчанию `info` |
| `TEAMLY_*` | (план 2) | См. дизайн-документ |
| `BOT_MODE`, `BOT_WEBHOOK*`, `SERVER_*` | (план 2) | Webhook-режим и HTTP-сервер появятся в плане 2 (вместе с деплоем) |

## Что НЕ делаем (явные исключения из скоупа MVP)

- ❌ Silence-alerts (15-минутный таймер на «зависшие» сообщения) — есть в work_analyst, СБ это не нужно.
- ❌ Feedback / rating / merchant-чаты — не применимо к СБ.
- ❌ `/broadcast`, `/send_to` — мёртвый груз для команды из 2 человек.
- ❌ Админы/супер-админы — все `sb_employees` равны.
- ❌ Автоматическая рассылка отчётов по cron — только on-demand через `/report`.
- ❌ Отслеживание статусов карточек Teamly и времени в работе.
- ❌ Webhook от Teamly — не нужен при готовых агрегатах.
- ❌ Mail.ru в MVP — phase 2.

## Текущий статус

**Сделано в MVP (план 1):**
- YDB-база `security-analytics-bot-db` + сервисный аккаунт.
- Миграции трёх таблиц: `sb_employees`, `trigger_chats`, `telegram_events`.
- Бот в polling-режиме: bootstrap `INITIAL_SB_USERS`, команды `/start`, `/add_sb`, `/remove_sb`, `/list_sb`, `/add_trigger_chat`, `/remove_trigger_chat`, `/list_trigger_chats`.
- `TelegramSource`: сообщения / эмодзи-реакции / `trigger_reply` сотрудников СБ из trigger-чатов пишутся в `telegram_events`.
- `/report` — заглушка (Excel-сборка в плане 2).
- 5 юнит-тестов на event-builder (TDD).

**В работе на план 2 (Teamly + Excel + cron + webhook + деплой):**
1. Доступ к Teamly External API (тариф Business/Enterprise) + Bearer-токен — частично есть (см. `.env`).
2. Уточнение, отдаёт ли API цифры «за конкретный день» или только totals.
3. `teamly_user_id` для Ани и Светланы.
4. `ReportBuilder` (ExcelJS, 3 листа).
5. HTTP-сервер (Hono) + webhook-режим.
6. Деплой в Yandex Cloud Serverless Container.

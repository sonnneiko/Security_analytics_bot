# Teamly-интеграция: дизайн

**Дата:** 2026-05-27
**Контекст:** план 2 (Teamly + Excel + cron + webhook + деплой) из общего дизайн-документа `2026-05-24-security-analytics-bot-design.md`. Этот документ заменяет Teamly-часть в исходном дизайне.

## Зачем переписываем

Исходный дизайн предполагал ежедневный snapshot готовых агрегатов «Создал / Просмотрел / Прокомментировал» через Teamly External API. После изучения доки (`docs/teamly/`) выяснилось, что **этих агрегатов в External API нет**: эндпоинта user-statistics не существует, события `view` тоже нет.

Зато есть webhook-стрим (`article.*`, `comment.*`) и недокументированный, но рабочий, эндпоинт чтения статьи по id. Карточки умных таблиц в Teamly технически считаются статьями — на их создание приходит обычный `article.create`. Значит, для нашей задачи Teamly-источник = event-stream (как Telegram), а не snapshot.

## Скоуп MVP

| Метрика для Excel | Источник | Атрибуция |
|---|---|---|
| Создал статей/карточек | webhook `article.create` + дочитка автора через `/api/v1/wiki/ql/article` | автор статьи |
| Прокомментировал | webhook `comment.create` | `createdBy` из payload |
| ~~Посмотрел~~ | — | **не реализуемо в External API**, выбрасываем из отчёта |

**Не делаем:**
- ❌ Snapshot-таблицы (`teamly_daily_stats` из старого дизайна — удалить из памяти).
- ❌ Analytics-модуль Teamly (его эндпоинты в External API не экспонированы, на пробе все 404).
- ❌ `article.publish` отдельно — игнорируем, считаем только `create`.
- ❌ Смены статусов карточек (`property.update_value`).
- ❌ tbd.body endpoint (его публично нет; не нужен, т.к. карточки = `article.create`).
- ❌ Cron в Teamly-части. Refresh токенов — ленивый.

## Архитектура

```
Teamly UI ──webhook POST──► Hono /teamly/webhook/<secret> ──► TeamlySource ──► teamly_events (YDB)
                                                               ↑
                                       (на article.create)     │
                                                               └── TeamlyApi.getArticle
                                                                       (Bearer + X-Account-Slug)
                                                                       ↑
                                                                TokenStore (YDB teamly_tokens, 1 строка)
```

### Компоненты

**`TeamlySource`** — зеркалит существующий `TelegramSource`. Принимает «сырое» webhook-событие, фильтрует не нужные actions/entityTypes, для статей дочитывает автора, маппит `teamly_user_id` → `telegram_id` через `sb_employees`, пишет в `teamly_events`. События не-СБ-юзеров **не сохраняются**.

**`TeamlyApi`** — OAuth2-клиент. Публичный API:
- `getArticleAuthor(articleId): Promise<string | null>` — основной метод; возвращает Teamly `user_id` автора.
- `exchangeCode(code): Promise<TokenSet>` — обмен одноразового `code` на access+refresh (для bootstrap).
- `refresh(): Promise<void>` — обновляет токены в `teamly_tokens` (используется ленивым refresh-механизмом, можно держать private).

Внутри: ленивый refresh перед каждым запросом — если `access_expires_at - now() < 5min`, рефрешит и сохраняет новые токены. На 5xx от Teamly API: одна повторная попытка с паузой 2 сек, потом throw (воркер делает log-and-drop).

**`TokenStore`** — YDB CRUD по таблице `teamly_tokens` (1 строка с `id='default'`).

**Hono-сервер** — общий для Telegram и Teamly. **Сам сервер появляется в master-плане 2** (вместе с деплоем и Telegram webhook). Этот спек добавляет к нему **только новый маршрут** `POST /teamly/webhook/<secret>` (плюс in-process очередь и воркер). Если master-план 2 ещё не реализовал сервер на момент имплементации этого спека — последовательность задач в plan'е должна это учесть (сначала сервер, потом маршрут).

Маршруты сервера на момент завершения плана 2:
- `POST /telegram/webhook/<secret>` — из master-плана.
- `POST /teamly/webhook/<secret>` — из этого спека.

**Воркер очереди событий** — простой in-process: получаем webhook → кладём в массив → отвечаем 200 OK Teamly → фоном обрабатываем. Цель: уложиться в 30-секундный SLA Teamly без оглядки на дочитки.

## Хранение в YDB

Две новые миграции, обе аддитивные. Текущий счётчик в `src/database/migrations.ts` — `001_sb_employees`, `002_trigger_chats`, `003_telegram_events`. Следующие свободные номера — `004` и `005` (верифицировать перед добавлением).

### 004_teamly_events

```sql
CREATE TABLE teamly_events (
  event_id        Utf8,             -- "article_create:<uuid>" | "comment_create:<uuid>"
  employee_id     Uint64,           -- telegram_id сотрудника СБ (FK sb_employees)
  teamly_user_id  Utf8,             -- автор в Teamly
  event_type      Utf8,             -- 'article_create' | 'comment_create'
  entity_id       Utf8,             -- uuid статьи/комментария
  container_id    Utf8,             -- uuid пространства для статей, NULL для комментариев
  occurred_at     Timestamp,
  payload         Json,             -- сырой webhook для дебага
  PRIMARY KEY (event_id),
  INDEX idx_employee_time GLOBAL ON (employee_id, occurred_at)
)
```

- **`event_id` детерминирован** — `UPSERT` склеит ретраи Teamly (1мин/15мин/1ч/24ч).
- **Только события СБ** попадают в таблицу. Чужих в этой БД нет.
- `payload` сохраняется целиком для дебага и forensics — стоит дёшево.

### 005_teamly_tokens

```sql
CREATE TABLE teamly_tokens (
  id                   Utf8,        -- всегда 'default'
  access_token         Utf8,
  refresh_token        Utf8,
  access_expires_at    Timestamp,
  refresh_expires_at   Timestamp,
  cluster_domain       Utf8,        -- из ответа OAuth, обычно https://app.teamly.ru
  updated_at           Timestamp,
  PRIMARY KEY (id)
)
```

### `sb_employees`

Без изменений. Колонка `teamly_user_id` уже есть. Команда `/add_sb <tg_id> <teamly_uuid> <ФИО>` уже принимает её.

## Обработка webhook

### Маршрут

```
POST /teamly/webhook/<TEAMLY_WEBHOOK_SECRET>
```

`TEAMLY_WEBHOOK_SECRET` — случайная строка ≥32 символов в path. Teamly **не подписывает webhook-и** (в доке нет HMAC), поэтому единственная защита — секрет в URL и нераспространение его наружу. Не идеально, но MVP-достаточно.

**Ротация секрета** (если есть подозрение на утечку): (1) сгенерировать новый `openssl rand -hex 32`, (2) обновить `TEAMLY_WEBHOOK_SECRET` в env прод-инстанса, (3) в Teamly UI отредактировать webhook URL на новый. До шага 3 будут приходить 404 на старый URL — это ок, Teamly будет ретраить по своему графику.

### Алгоритм

```
[0] secret в path не совпал с env → 404, выход.
[1] Распарсить body. Невалидный JSON → 400.
[2] action !== 'create' → 200 OK, выход.
    (publish/garbage/restore/archive/unarchive/update_value — игнор.
     comment.update/delete тоже игнорируем намеренно: «прокомментировал» = факт первого создания,
     правки текста не меняют счётчик.)
[3] entityType ∉ {'article', 'comment'} → 200 OK, выход.
    (space/tbd/tbd.body/property — игнор.)
[4] Положить событие во внутреннюю очередь.
[5] Сразу 200 OK Teamly. Дочитки и запись в БД — фоном.

Воркер очереди:
[6] Резолвить автора:
    - comment: createdBy из payload
    - article: TeamlyApi.getArticleAuthor(entityId)
[7] Если автор null или teamly_user_id не привязан к sb_employees → drop, лог.
[8] UPSERT в teamly_events.
```

### Семантика очереди

- **Один воркер**, последовательная обработка (FIFO). Параллелизм не нужен при прогнозируемой нагрузке ≤60 событий/день; даёт детерминированный порядок и упрощает дебаг.
- **Per-event try/catch + log-and-drop:** ошибка в одном событии не должна валить воркер. На 5xx от Teamly API — одна повторная попытка с паузой 2 сек, потом drop с warn.
- **Без bounded backpressure:** массив без верхней границы. При worst-case 60 ev/день → ~0 шансов переполнить процесс.
- **Потеря in-flight событий при рестарте — принимаем.** Мы уже ответили Teamly 200 OK, ретрая не будет. Митигация: волюм ~20 событий/день, отчёт месячный, потеря 1-2 событий за время рестарта (секунды) — статистический шум. `payload` в БД сохраняется только для тех событий, что успешно прошли воркер; «потерянные» не оставляют следа. Если в будущем станет проблемой — добавить персистентную очередь в YDB (отдельная миграция), но **в MVP не делаем**.

### Дочитка автора статьи

Эндпоинт `/api/v1/wiki/ql/article` недокументирован (в `docs/teamly/` его нет, но пробинг показал 401 = эндпоинт существует, нужен Bearer). Гипотеза схемы по аналогии со `space`:

```http
POST {clusterDomain}/api/v1/wiki/ql/article
Authorization: Bearer <access_token>
X-Account-Slug: <slug>
Content-Type: application/json

{
  "query": {
    "__filter": { "id": "<entityId>" },
    "id": true,
    "author": { "id": true, "fullName": true }
  }
}
```

**Когда проверяем гипотезу:** на **спайк-этапе перед основной имплементацией** — отдельный шаг в плане. Делается одним curl-запросом против боевого тенанта (нужен access_token, который получаем единожды через bootstrap). Если гипотеза не подтвердилась — спек обновляется до того как пишется остальной код. Это не «деплоим и смотрим».

**План Б, если не сработает:**
1. Попробовать `POST /api/v1/wiki/ql/articles` с `__filter.id` или `__filter.ids`.
2. Если оба провалятся — событие пишем с `employee_id = NULL`, в отчёт не попадёт, в логе warn «author unknown». Параллельно открываем запрос в поддержку Teamly.

**Reprocessing-путь для `employee_id=NULL`:** сырой `payload` (включая `entityId`) сохранён в `teamly_events`. После того как эндпоинт-схема найдена — можно прогнать оффлайн-скрипт, который выберет события с `employee_id IS NULL`, дочитает авторов и проUPDATEит строки. В MVP скрипт не пишем, но БД к этому готова.

### Квота External API

Дочитка нужна **только на `article.create` от СБ-юзеров** (если webhook прислал не-СБ-автора, мы тоже сначала дочитываем, потом дропаем; кеш не делаем в MVP). При ≤20 карточек/день у команды из 2 человек, и допустим ещё ×3 на не-СБ-юзеров (потому что webhook приходит на все события в подписанных пространствах), это ~1800 req/мес — < 20% месячного лимита 10 000. Запас 5×.

Если квота будет приближаться → добавить in-memory LRU кеш `article_id → author_id` с TTL 1ч. **В MVP не делаем.** Kill-switch для решения о включении: если в логах появляется > 200 успешных дочиток в день в течение недели подряд.

## Аутентификация

Teamly использует OAuth2 «integration authorize» flow (см. [docs/teamly/01-auth.md](../../teamly/01-auth.md)):

1. **Одноразовый bootstrap (руками):** в Teamly UI создаётся интеграция → пользователь получает `client_id`, `client_secret`, `redirect_uri`, одноразовый `code`.
2. **Обмен code → tokens:** `POST https://{slug}.teamly.ru/api/v1/auth/integration/authorize` с `client_id + client_secret + redirect_uri + code` → `access_token + refresh_token + access_token_expires_at + refresh_token_expires_at + accounts[].clusterDomain`.
3. **Refresh:** `POST https://{slug}.teamly.ru/api/v1/auth/integration/refresh` с `client_id + client_secret + refresh_token`. Refresh-token живёт 2 недели.
4. **API-запросы:** `Authorization: Bearer <access>` + `X-Account-Slug: <slug>`, base = `clusterDomain` из ответа OAuth.

### Бутстрап на первый запуск

```
on startup:
  row = teamly_tokens.find('default')
  if row:
    use row → готово (TEAMLY_AUTH_CODE в env игнорируется, даже если протух — токены уже в БД)
  else if env.TEAMLY_AUTH_CODE:
    try exchange code → tokens:
      success: save to teamly_tokens with id='default'; log "teamly auth bootstrapped"
      4xx (code burned/invalid):
        log error "teamly bootstrap failed: code rejected, integration disabled"
        Teamly-источник отключен, бот продолжает работать (Telegram-часть не страдает)
      5xx/network: log error, retry один раз с паузой 5 сек; при повторе — то же что 4xx
  else:
    log warn "teamly disabled: no tokens and no auth code"
    Teamly-источник отключен
```

После первого запуска `TEAMLY_AUTH_CODE` из env можно удалить — он одноразовый. Refresh-token в БД будет автоматически обновляться при каждом успешном refresh. **Бот никогда не падает из-за Teamly-проблем** — все сценарии деградируют до «Teamly отключен», Telegram-часть продолжает работать.

### Ленивый refresh

Перед любым API-запросом:
```
if now() + 5min >= access_expires_at:
  refresh()
  if refresh failed (refresh_token expired) → лог error, throw, fail-graceful
```

Если refresh провалился (например, кто-то нажал «Выключить интеграцию» в Teamly UI или прошло > 2 недель без запросов) — бот пишет error в лог, Teamly-фичи отключаются до ручного re-bootstrap (`TEAMLY_AUTH_CODE` в env + рестарт). В Excel в этот период колонка «Создал» будет занижена. **Алерта на это в MVP нет** — добавим если станет проблемой.

## Excel-отчёт: изменения

Только дельта от старого дизайна:

**Лист «По сотрудникам»** — было 3 колонки Teamly, остаётся 2:

| Старое | Новое |
|---|---|
| Создал | **Создал** ← `count(teamly_events) where employee_id=X and event_type='article_create' and occurred_at in [period]` |
| Просмотрел | ~~убрана~~ |
| Прокомментировал | **Прокомментировал** ← `count(...) and event_type='comment_create'` |

**Лист «Итоги»** — аналогично, строка «Просмотрел» удалена.

**Лист «По чатам Telegram»** — без изменений.

**Telegram-колонки в листе «По сотрудникам» и листе «Итоги»** — без изменений (Ответы / Уник.триггеры / Реакции — как описано в master-design).

Имена файлов без изменений.

## Конфигурация

### ENV-переменные

| Переменная | Обязательная | Описание |
|---|---|---|
| `TEAMLY_SLUG` | да | slug тенанта (напр. `unitpay`) |
| `TEAMLY_CLIENT_ID` | да | uuid интеграции |
| `TEAMLY_CLIENT_SECRET` | да | секретный ключ интеграции |
| `TEAMLY_REDIRECT_URI` | да | должен совпадать с указанным при создании интеграции |
| `TEAMLY_AUTH_CODE` | только на первый запуск | одноразовый код. После того как `teamly_tokens` инициализирован — может быть пустым/удалённым. |
| `TEAMLY_WEBHOOK_SECRET` | да | случайная строка ≥32 символов, попадает в path webhook URL |

Старые `TEAMLY_API_TOKEN`/`TEAMLY_API_SECRET`/`TEAMLY_INTEGRATION_ID` из текущего `.env.example` переименовать в новые имена выше и обновить README.

### Шаги настройки (один раз)

1. В Teamly UI: Управление аккаунтом → Интеграции → Добавить интеграцию → получить `client_id`, `client_secret`, `code`, выставить `redirect_uri`.
2. В Teamly UI: Управление аккаунтом → Интеграции → Webhook → Добавить webhook на `https://<prod-domain>/teamly/webhook/<TEAMLY_WEBHOOK_SECRET>` с подпиской только на `article.create` и `comment.create` (других не подписываем — лишняя нагрузка и квота на наш сервер).
3. Заполнить `.env` (см. таблицу выше). `TEAMLY_WEBHOOK_SECRET` сгенерировать локально (`openssl rand -hex 32`).
4. Узнать `teamly_user_id` для Ани и Светланы (Teamly UI → Управление аккаунтом → Пользователи) и поставить в `INITIAL_SB_USERS` (или после старта `/add_sb <tg> <teamly_uuid> <ФИО>`).
5. Старт бота. Если в логах «teamly auth bootstrapped» — всё ок. После этого `TEAMLY_AUTH_CODE` из env можно убрать.

## Тесты (как в Telegram-части)

Зеркалит структуру `tests/sources/telegram/` из master-плана:

- **`tests/sources/teamly/event-builder.test.ts`** — юниты на маппинг webhook payload → `TeamlyEventRow`. Кейсы: article.create с автором-СБ; article.create с автором-не-СБ (drop); comment.create с createdBy-СБ; comment.create с не-СБ; невалидный action; невалидный entityType.
- **`tests/sources/teamly/teamly-api.test.ts`** — юнит на ленивый refresh (мок HTTP). Кейсы: токен ещё свежий — refresh не зовётся; токен истекает через 3 мин — refresh зовётся; refresh-token протух — throw.
- **Интеграционный тест с реальным YDB не обязателен в MVP** — UPSERT по детерминированному ключу уже покрыт queries-слоем.

## Что меняется в существующем коде

| Файл | Изменение |
|---|---|
| `src/database/migrations.ts` | +004_teamly_events, +005_teamly_tokens |
| `src/database/queries/teamly-events.ts` | новый: `insertEvent` |
| `src/database/queries/teamly-tokens.ts` | новый: `getToken`, `saveToken` |
| `src/sources/teamly/teamly-source.ts` | новый: класс `TeamlySource implements DataSource` |
| `src/sources/teamly/teamly-api.ts` | новый: OAuth2 + `getArticleAuthor` |
| `src/sources/teamly/event-builder.ts` | новый: webhook → `TeamlyEvent` |
| `src/server/index.ts` | новый Hono-сервер с обоими маршрутами (Telegram уже в плане 2) |
| `src/server/teamly-webhook.ts` | новый: обработчик `POST /teamly/webhook/<secret>` + очередь |
| `src/config.ts` | +6 ENV-переменных |
| `src/main.ts` | bootstrap токенов, запуск воркера очереди |
| `README.md` | удалить упоминания «снапшоты Teamly агрегатов» и «Просмотрел»; добавить шаги настройки Teamly |

## Открытые риски и допущения

1. **Эндпоинт `/api/v1/wiki/ql/article` недокументирован.** Может измениться без уведомления. Митигация: при ошибке схемы — лог + автор `null`, отчёт не падает.
2. **`teamly_tokens` в YDB — single row.** Если кто-то случайно затрёт строку — потеряем токены. Это считается приемлемым, т.к. re-bootstrap занимает 5 минут и есть `TEAMLY_AUTH_CODE` fallback.
3. **Webhook без HMAC.** Кто-то знающий путь может слать левые события. Митигация: длинный secret, ротация при подозрении.
4. **Никто не алертит когда refresh-token протух.** Если бот молчал > 2 недель (отпуск/инцидент) — Teamly-часть тихо отвалится до ручного re-bootstrap. Митигация: смотреть в логи, в перспективе добавить метрику last-successful-refresh.
5. **Карточки = статьи через `article.create` — гипотеза.** Подтверждена скринами UI (Analytics показывает карточки в «Список статей»), но эмпирически на webhook-уровне не проверена. Проверяется на спайк-этапе (см. ниже). Если гипотеза не подтверждается (карточки приходят как `tbd.body.create`, не `article.create`) — спек пересматривается до начала основной реализации: расширяем фильтр на `tbd.body.create`, и параллельно поднимаем вопрос об эндпоинте чтения tbd.body в поддержку Teamly.

## Acceptance criteria для спайка (до основной имплементации)

Спайк — отдельная, минимальная задача в plan-документе. Цель: за 1-2 часа эмпирически подтвердить/опровергнуть два допущения и закрыть схему недокументированного эндпоинта.

1. **Подтвердить, что создание карточки в умной таблице приходит как `article.create`** (не `tbd.body.create`). Метод: поднять webhook.site (или ngrok), подписать на оба события, создать тестовую карточку, посмотреть какой entityType пришёл.
2. **Подтвердить схему `POST /api/v1/wiki/ql/article`.** Метод: получить access_token через bootstrap-обмен, дёрнуть эндпоинт с гипотетическим body, проверить что вернулся `author.id`. Если схема не совпала — пробовать варианты из «План Б», задокументировать рабочий.
3. **Зафиксировать результаты в этом спеке** (или в follow-up doc) до перехода к основной имплементации.

Если оба пункта подтверждены — основная имплементация идёт по плану. Если #1 опровергнут — спек редактируется (`article.create` → `article.create OR tbd.body.create`) и переоценивается feasibility (т.к. для tbd.body нет публичного GET-эндпоинта, см. memory project-teamly-api-capabilities).

## Ссылки

- Общий дизайн бота: `docs/superpowers/specs/2026-05-24-security-analytics-bot-design.md`
- Teamly API docs (зеркало): `docs/teamly/`
- Reference work_analyst: https://github.com/sonnneiko/work_analyst

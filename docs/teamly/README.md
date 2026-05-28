# Teamly External API — спецификация (зеркало доки)

Скачано из `https://academy.teamly.ru/at/dfa9a32d-02c8-4f35-95d9-c98ca2e478c0` через headless Chromium (Vue SPA не отдаёт контент curl-ом). Дата: 2026-05-27.

## Разделы

| Файл | Раздел | Источник |
|---|---|---|
| [00-index.md](./00-index.md) | Интеграции и внешние API (обзор) | https://academy.teamly.ru/at/dfa9a32d-02c8-4f35-95d9-c98ca2e478c0 |
| [01-auth.md](./01-auth.md) | Авторизация (OAuth2 token exchange + refresh) | https://academy.teamly.ru/at/4ecf00c0-0611-475e-a0f5-661effff8c96 |
| [02-spaces.md](./02-spaces.md) | Пространство (CRUD + поиск с фильтрами) | https://academy.teamly.ru/at/e8f69e50-e51d-4c58-939c-8ec99b68be49 |
| [03-users.md](./03-users.md) | Пользователи (CRUD + лимиты аккаунта) | https://academy.teamly.ru/at/ba28a7f1-a984-491d-99ce-c4a10ce2d7a2 |
| [04-webhooks.md](./04-webhooks.md) | Webhooks (события article / comment / space / tbd / property) | https://academy.teamly.ru/at/5c11a266-7857-40c6-b8c9-25c89c5a0c4f |
| [05-ai.md](./05-ai.md) | Запросы к TEAMLY AI | https://academy.teamly.ru/at/000ee9d6-82c2-453b-b190-a3b5c66286ea |

## Ключевые выводы для нашего бота

- **Лимит:** 10 000 запросов в месяц (отсчёт от даты покупки тарифа, не календарный).
- **Хост API:** `https://{slug}.teamly.ru` — нужен slug тенанта (не `academy.teamly.ru`, тот — публичная вики с доками).
- **Авторизация:** OAuth2-обмен `client_id + client_secret + code → access_token + refresh_token` (refresh жив 2 недели). Все запросы: `Authorization: Bearer <access_token>` + `X-Account-Slug: <slug>`. URL базы для API из ответа: `clusterDomain` (для SaaS обычно `https://app.teamly.ru`).
- **Эндпоинта «статистика активности пользователя» НЕТ.** Метрики «Посмотрел / Создал / Прокомментировал», видимые в UI Teamly, через External API не отдаются. См. [03-users.md](./03-users.md) — только CRUD и лимиты аккаунта по числу сотрудников.
- **Webhooks** дают события `article.create/publish/garbage/restore/archive/unarchive`, `comment.create/update/delete` и пр. (см. [04-webhooks.md](./04-webhooks.md)). События `view` нет.
  - `comment.create` содержит `createdBy` — кто оставил комментарий, можно сразу считать.
  - `article.create` НЕ содержит автора в payload — для атрибуции нужен доп. GET по статье.
- **Retry-политика webhooks:** успешный код 200–299 ожидается в течение 30 сек; иначе ретраи 1мин → 15мин → 1ч → 24ч, после чего webhook автоматически отключается.

## Качество экспорта

Текст и таблицы — полные. Длинные кодовые примеры (≥36 строк) могут быть **обрезаны** — Teamly использует CodeMirror, который виртуализирует строки вне видимой области. Если в коде встретится оборванный JSON / curl — открыть исходную страницу.

## Как пересобрать

Парсер: `/tmp/teamly-scrape/crawl-md.js` (Playwright + Turndown). Запуск: `node /tmp/teamly-scrape/crawl-md.js` (потребуется `npm install playwright turndown turndown-plugin-gfm` и `npx playwright install chromium`).

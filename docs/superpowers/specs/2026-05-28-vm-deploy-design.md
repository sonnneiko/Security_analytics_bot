# Деплой на ВМ (Yandex Cloud Compute) — Design

**Дата:** 2026-05-28
**Статус:** на ревью
**Связанные доки:** [2026-05-24 Security Analytics Bot](2026-05-24-security-analytics-bot-design.md), [2026-05-28 Отчёт /report](2026-05-28-report-feature-design.md)

---

## 1. Контекст и цель

Поднять бота на постоянную работу на виртуальной машине, чтобы он 24/7 собирал события (Telegram + Teamly) в YDB и отдавал `/report` по запросу. Исходный дизайн (2026-05-24) предполагал Yandex Serverless Container — здесь сознательный отказ в пользу **обычной ВМ** (проще операционно, polling без холодных стартов, постоянный процесс под webhook Teamly).

Состояние приложения сейчас: Node, запуск `npm start` (= `tsx src/main.ts`), Telegram в **polling** ([main.ts](../../../src/main.ts)), Hono-сервер для Teamly webhook на `SERVER_PORT` ([server/index.ts](../../../src/server/index.ts)), YDB внешний по `grpcs` + SA-ключ.

## 2. Решения (из брейнсторма 2026-05-28)

- **Среда:** Yandex Cloud Compute, Ubuntu LTS, статический публичный IP.
- **Telegram:** polling (как сейчас) — никакого входящего HTTPS для Telegram не нужно.
- **Teamly webhook:** публичный HTTPS через `nip.io` + Let's Encrypt (своего домена нет).
- **Рантайм:** systemd-юнит для Node-бота + Caddy (отдельный systemd-сервис) как TLS-reverse-proxy. Деплой — ручной скрипт `git pull` + restart.

## 3. Топология

```
Telegram API ──(polling, исходящие)──► [ Node-бот :8080 (systemd: sb-bot) ] ──grpcs:2135──► YDB (Yandex Serverless)
Teamly ──(webhook, входящие :443)──► [ Caddy :443/:80 (systemd) ] ──reverse_proxy──► localhost:8080  (/teamly/webhook/<secret>)
```

- Node-бот слушает только `localhost:8080` (наружу не торчит).
- Наружу торчит только Caddy: `:443` (webhook) и `:80` (ACME HTTP-01).

## 4. Инфраструктура (Yandex Cloud)

- **ВМ:** Ubuntu 22.04/24.04 LTS, 2 vCPU / 2 ГБ — с запасом для Node + Caddy. Статический публичный IP.
- **Security group:**
  - Входящие: `443` (откуда угодно — Teamly), `80` (откуда угодно — ACME), `22` (желательно только с IP администратора).
  - Исходящие: открыты (Telegram API `api.telegram.org:443`, YDB `grpcs:2135`, ACME).
- **YDB:** существующая Serverless-база; доступ по `secrets/ydb-sa-key.json`. Сетевой доступ с ВМ к публичному endpoint YDB по `grpcs`.

## 5. Раскладка на ВМ

- Код: `git clone` в `/opt/sb-bot`.
- Node 20+ через NodeSource apt-репозиторий.
- Зависимости: `npm ci` **с** devDependencies — `tsx`/`typescript` нужны в рантайме (build-шага нет; запуск `tsx`).
- Секреты (не в git, уже в `.gitignore`), заливаются вручную (scp):
  - `/opt/sb-bot/.env` — все ENV (см. [.env.example](../../../.env.example)).
  - `/opt/sb-bot/secrets/ydb-sa-key.json` — SA-ключ YDB.

## 6. systemd-юнит `sb-bot`

```ini
[Unit]
Description=Security Analytics Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/sb-bot
EnvironmentFile=/opt/sb-bot/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=sbbot
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

- Логи pino(JSON) → journald (`journalctl -u sb-bot`). `pino-pretty` только в dev; в проде — сырой JSON.
- `LOG_LEVEL=info` в проде.
- `EnvironmentFile` подхватывает `.env`; при этом `dotenv` в коде тоже сработает — конфликта нет (одни и те же значения).

## 7. Caddy (TLS-reverse-proxy)

`/etc/caddy/Caddyfile`:
```
<ip-с-дефисами>.nip.io {
    reverse_proxy localhost:8080
}
```
- Caddy сам получает и продлевает сертификат Let's Encrypt (HTTP-01, нужен открытый `:80`).
- `<ip-с-дефисами>.nip.io` резолвится в IP ВМ (например `51-250-1-2.nip.io` → `51.250.1.2`).
- Запускается своим systemd-сервисом (`systemctl enable --now caddy`).

## 8. Скрипты (в репозитории, `scripts/`)

- **`scripts/provision.sh`** — разовая подготовка чистой ВМ (идемпотентно по возможности):
  - apt: Node (NodeSource), Caddy (официальный репозиторий), git;
  - создать пользователя `sbbot`, каталог `/opt/sb-bot`;
  - установить systemd-юнит `sb-bot.service` и `Caddyfile` (подставить nip.io-хост);
  - `systemctl enable` обоих сервисов.
  - Не делает: заливку секретов и `git clone` (это руками/отдельно, т.к. требуют доступов).
- **`scripts/deploy.sh`** — обновление уже подготовленной ВМ:
  - `cd /opt/sb-bot && git pull`
  - `npm ci`
  - `sudo systemctl restart sb-bot`
  - проверка `curl -fsS localhost:8080/healthz` → `ok` (иначе ненулевой код возврата).

> Часть провижена (создание ВМ, статический IP, security group) делается в консоли/`yc` CLI Yandex Cloud — документируется в README-секции, не в скрипте.

## 9. Первый запуск и Teamly OAuth

1. Создать ВМ + статический IP + security group; настроить DNS не нужно (nip.io).
2. `provision.sh`, затем `git clone`, залить `.env` и `secrets/`.
3. В `.env`: `TEAMLY_REDIRECT_URI` и одноразовый `TEAMLY_AUTH_CODE` из UI Teamly (code сгорает при первом обмене; `redirect_uri` должен совпасть). После первого успешного старта токены сохранятся в YDB — `TEAMLY_AUTH_CODE` убрать из `.env`.
4. `systemctl start sb-bot`, проверить `/healthz` и логи.
5. В UI Teamly зарегистрировать webhook: `https://<ip-dashes>.nip.io/teamly/webhook/<TEAMLY_WEBHOOK_SECRET>`.
6. Сделать бота **администратором** каждого триггер-чата в Telegram.

## 10. Операционные нюансы аптайма (важно для «данные пишутся постоянно»)

При работающей ВМ данные пишутся в реальном времени; хранилище — внешний YDB, на ВМ состояния нет (ВМ можно пересоздать). Но непрерывность зависит от аптайма:

- **Сбор только вперёд:** история «задним числом» не восстанавливается; реакции на сообщения до старта сбора не матчатся.
- **Простой ВМ < 24 ч:** Telegram хранит непрочитанные апдейты ~24 ч — бот наверстает при старте (polling возобновляется с последнего offset).
- **Простой ВМ > 24 ч:** часть Telegram-апдейтов теряется безвозвратно; **Teamly после 24 ч неудачных доставок отключает webhook** — потребуется заново включить его в UI.
- **Teamly refresh-токен живёт 2 недели:** пока бот жив хотя бы раз в ~2 недели — токен обновляется лениво; простой > 2 недель → повторная авторизация (`TEAMLY_AUTH_CODE`).
- **Бот не админ чата** → `message_reaction` не приходят, «обработано триггеров» недосчитает реакции (ответы продолжат собираться).

## 11. Проверка после деплоя

- `systemctl status sb-bot caddy` — оба active.
- `journalctl -u sb-bot -n 50` — старт без ошибок, «bot started», «teamly tokens loaded»/«bootstrapped».
- `curl https://<ip-dashes>.nip.io/healthz` → `ok` (проверяет и TLS, и проксирование).
- Тестовое сообщение/реакция в триггер-чате → событие в логах (`LOG_LEVEL=debug` временно).
- `/report month` в ЛС бота возвращает .xlsx.

## 12. Что НЕ делаем (вне скоупа)

- ❌ CI/CD-пайплайн — деплой ручным скриптом (команда из 2 человек).
- ❌ Docker / контейнеризация.
- ❌ Telegram webhook — остаёмся на polling.
- ❌ Свой домен — используем nip.io.
- ❌ Сборка в JS (`tsc`) — запускаем через `tsx`.
- ❌ Бэкап ВМ — состояние только в YDB.

## 13. Открытые вопросы

Нет — решения приняты в брейнсторме 2026-05-28.

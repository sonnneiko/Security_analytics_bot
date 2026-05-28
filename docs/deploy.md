# Деплой sb-bot на ВМ (Yandex Cloud Compute)

Подробный дизайн: [docs/superpowers/specs/2026-05-28-vm-deploy-design.md](superpowers/specs/2026-05-28-vm-deploy-design.md).
Артефакты: `scripts/sb-bot.service`, `scripts/Caddyfile.example`, `scripts/provision.sh`, `scripts/deploy.sh`.

## 0. Что нужно заранее
- BOT_TOKEN, INITIAL_SB_USERS, BOT_ADMINS.
- YDB endpoint/database + `secrets/ydb-sa-key.json`.
- Teamly: SLUG / CLIENT_ID / CLIENT_SECRET / REDIRECT_URI, одноразовый AUTH_CODE, сгенерированный WEBHOOK_SECRET (`openssl rand -hex 32`).

## 1. Создать ВМ (консоль или `yc` CLI)
- Ubuntu 22.04/24.04 LTS, 2 vCPU / 2 ГБ, диск 20 ГБ.
- **Статический публичный IP** (зафиксировать — он войдёт в nip.io-хост).
- Security group:
  - входящие: TCP `443` (0.0.0.0/0), TCP `80` (0.0.0.0/0, для ACME), TCP `22` (только с IP администратора);
  - исходящие: разрешить всё.
- SSH-ключ для доступа.

Запиши IP, например `51.250.1.2` → nip.io-хост `51-250-1-2.nip.io`.

## 2. Подготовка ВМ
```bash
ssh ubuntu@<IP>
sudo apt-get update
git clone <repo-url> /tmp/sb-bot-src      # только ради scripts/, либо клонируй сразу в /opt
sudo bash /tmp/sb-bot-src/scripts/provision.sh 51-250-1-2.nip.io
```
`provision.sh` ставит Node 20, Caddy, git; создаёт пользователя `sbbot` и `/opt/sb-bot`; ставит и `enable`-ит юнит `sb-bot` (без старта) и поднимает Caddy.

## 3. Код и секреты
```bash
sudo git clone <repo-url> /opt/sb-bot           # если ещё не клонирован
# .env
sudo tee /opt/sb-bot/.env >/dev/null <<'ENV'
BOT_TOKEN=...
INITIAL_SB_USERS=[{"telegram_id":6300594719,"name":"Ани Тоноян"},{"telegram_id":7924502831,"name":"Светлана Григорьева"}]
BOT_ADMINS=[6335871839]
SERVER_PORT=8080
YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135
YDB_DATABASE=/ru-central1/<cloud-id>/<db-id>
YDB_SA_KEY_FILE=./secrets/ydb-sa-key.json
TEAMLY_SLUG=...
TEAMLY_CLIENT_ID=...
TEAMLY_CLIENT_SECRET=...
TEAMLY_REDIRECT_URI=...
TEAMLY_AUTH_CODE=...           # одноразовый; убрать после первого успешного старта
TEAMLY_WEBHOOK_SECRET=...
LOG_LEVEL=info
ENV
# SA-ключ YDB: скопировать с локальной машины (выполняется ЛОКАЛЬНО, не на ВМ):
#   scp ./secrets/ydb-sa-key.json ubuntu@<IP>:/tmp/ydb-sa-key.json
# затем на ВМ:
sudo mkdir -p /opt/sb-bot/secrets
sudo mv /tmp/ydb-sa-key.json /opt/sb-bot/secrets/ydb-sa-key.json
# права
sudo chown -R sbbot /opt/sb-bot
sudo chmod 600 /opt/sb-bot/.env
```

## 4. Первый запуск
```bash
cd /opt/sb-bot && sudo -u sbbot bash -c 'unset NODE_ENV; npm ci --include=dev'
sudo systemctl start sb-bot
journalctl -u sb-bot -n 60 --no-pager
```
В логах ожидаем: `bot started`, `teamly tokens loaded`/`teamly auth bootstrapped`, и **`teamly webhook route registered`**.
> Если строки `teamly webhook route registered` нет — Teamly-источник не поднялся (сгорел AUTH_CODE или ошибка OAuth). Вебхук вернёт 404. Исправить `.env` (новый AUTH_CODE) и перезапустить, прежде чем регистрировать вебхук в Teamly.

После успешного старта убрать `TEAMLY_AUTH_CODE` из `.env` (токены уже в YDB) и `sudo systemctl restart sb-bot`.

## 5. Регистрация Teamly webhook
В UI Teamly указать URL:
```
https://51-250-1-2.nip.io/teamly/webhook/<TEAMLY_WEBHOOK_SECRET>
```

## 6. Бот — администратор триггер-чатов
Сделать @UnitSecurity_analytics_bot **администратором** каждого триггер-чата в Telegram. Иначе `message_reaction` не приходят и метрика «обработано триггеров» недосчитает реакции (ответы продолжат собираться).

## 7. Проверка
- `systemctl status sb-bot caddy` — оба `active`.
- `curl https://51-250-1-2.nip.io/healthz` → `ok` (проверяет TLS + проксирование).
- Тестовое сообщение/реакция в триггер-чате → событие в логах (`LOG_LEVEL=debug` временно).
- `/report month` в ЛС бота → приходит .xlsx.

## 8. Обновления
Запускать от пользователя с sudo (НЕ от `sbbot`) — скрипт сам делает файловые шаги от имени `sbbot`, а restart через sudo:
```bash
sudo bash /opt/sb-bot/scripts/deploy.sh
```

## 9. Аптайм (важно)
Данные пишутся постоянно, только пока ВМ жива; хранилище — внешний YDB (на ВМ состояния нет).
- Сбор только вперёд — истории «задним числом» нет.
- Простой ВМ > 24 ч: теряются Telegram-апдейты и Teamly **отключает webhook** (после 24 ч неудач) — включить заново в UI.
- Teamly refresh-токен живёт 2 недели: простой > 2 недель → повторная авторизация (новый `TEAMLY_AUTH_CODE`).

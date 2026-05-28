#!/usr/bin/env bash
# Обновление уже подготовленной ВМ.
# Запускать от пользователя С ПРАВАМИ sudo (НЕ от sbbot): шаги с файлами
# выполняются от имени sbbot (владелец /opt/sb-bot), restart — через sudo.
# Usage: sudo bash /opt/sb-bot/scripts/deploy.sh
set -euo pipefail

APP_DIR=/opt/sb-bot
APP_USER=sbbot

# Обновление кода и зависимостей — от имени владельца каталога (sbbot),
# иначе git ругается на "dubious ownership", а файлы оказались бы root-owned.
# devDependencies ОБЯЗАТЕЛЬНЫ (tsx/typescript в рантайме); env -u NODE_ENV —
# чтобы прод-окружение не заставило npm пропустить devDeps.
sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
sudo -u "$APP_USER" env -u NODE_ENV bash -c "cd '$APP_DIR' && npm ci --include=dev"

# Перезапуск сервиса — требует root.
sudo systemctl restart sb-bot

# healthcheck с ретраями (бот может стартовать пару секунд)
for _ in $(seq 1 10); do
  if curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then
    echo "healthz: ok"
    exit 0
  fi
  sleep 2
done

echo "healthz: FAILED — проверь 'journalctl -u sb-bot -n 50'" >&2
exit 1

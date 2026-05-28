#!/usr/bin/env bash
# Разовая подготовка чистой Ubuntu LTS ВМ под sb-bot.
# Запускать на ВМ от root (или через sudo). НЕ делает git clone и не заливает секреты.
# Usage: sudo bash scripts/provision.sh <nip-io-host>
#   например: sudo bash scripts/provision.sh 51-250-1-2.nip.io
set -euo pipefail

NIP_HOST="${1:?Usage: provision.sh <nip-io-host>, напр. 51-250-1-2.nip.io}"
APP_DIR=/opt/sb-bot
APP_USER=sbbot
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export DEBIAN_FRONTEND=noninteractive

apt-get update

# 1. Node 20 (NodeSource), если ещё не стоит подходящая версия
if ! node -v 2>/dev/null | grep -qE '^v(2[0-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# 2. Caddy (официальный репозиторий)
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# 3. git
apt-get install -y git

# 4. системный пользователь и каталог приложения
id -u "$APP_USER" >/dev/null 2>&1 || \
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"
chown -R "$APP_USER" "$APP_DIR"

# 5. systemd-юнит (enable без --now: кода и секретов ещё нет)
install -m 644 "$SCRIPT_DIR/sb-bot.service" /etc/systemd/system/sb-bot.service
systemctl daemon-reload
systemctl enable sb-bot

# 6. Caddyfile с подставленным хостом
sed "s/__NIP_HOST__/${NIP_HOST}/" "$SCRIPT_DIR/Caddyfile.example" > /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

cat <<EOF

Provision готов. Дальше вручную:
  1. git clone <repo> ${APP_DIR}  (или git -C ${APP_DIR} pull, если уже клонирован)
  2. Залить ${APP_DIR}/.env и ${APP_DIR}/secrets/ydb-sa-key.json (scp)
  3. chown -R ${APP_USER} ${APP_DIR} && chmod 600 ${APP_DIR}/.env
  4. bash scripts/deploy.sh   (или: sudo systemctl start sb-bot)
EOF

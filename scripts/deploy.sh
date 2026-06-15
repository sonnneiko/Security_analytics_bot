#!/usr/bin/env bash
# Push-деплой sb-bot С МАШИНЫ ОПЕРАТОРА (НЕ на ВМ).
#
# Почему rsync, а не git pull: /opt/sb-bot на ВМ — НЕ git-репозиторий (код
# заливается вручную), и у ВМ нет доступа к приватному GitHub. Поэтому код
# синхронизируется rsync-ом с локальной машины (где есть SSH-ключ к ВМ).
#
# Usage:  bash scripts/deploy.sh
# Env (необяз.):  SB_VM_HOST=yc-user@158.160.3.16  SB_SSH_KEY=~/.ssh/id_ed25519
set -euo pipefail

VM_HOST="${SB_VM_HOST:-yc-user@158.160.3.16}"
SSH_KEY="${SB_SSH_KEY:-$HOME/.ssh/id_ed25519}"
HEALTH_URL="${SB_HEALTH_URL:-https://158-160-3-16.nip.io/healthz}"
SSH="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=no"

# запускать из корня репозитория
cd "$(dirname "$0")/.."

# 1. ворота качества — не выкатываем сломанное
echo "==> typecheck + tests"
npm run typecheck
npm test

# 2. заливаем код во временный staging на ВМ (yc-user может писать только в /tmp)
echo "==> rsync → $VM_HOST:/tmp/sbdeploy"
rsync -az -e "$SSH" --delete ./src ./package.json ./package-lock.json "$VM_HOST:/tmp/sbdeploy/"

# 3. применяем как владелец каталога (sbbot), ставим зависимости, рестартим
echo "==> apply on VM + restart"
# shellcheck disable=SC2087
$SSH "$VM_HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
sudo -u sbbot rsync -a --delete /tmp/sbdeploy/src/ /opt/sb-bot/src/
sudo -u sbbot cp /tmp/sbdeploy/package.json /tmp/sbdeploy/package-lock.json /opt/sb-bot/
# devDeps ОБЯЗАТЕЛЬНЫ (tsx/typescript в рантайме); env -u NODE_ENV — чтобы
# прод-окружение не заставило npm пропустить devDependencies.
cd /opt/sb-bot && sudo -u sbbot env -u NODE_ENV npm ci --include=dev
sudo systemctl restart sb-bot
rm -rf /tmp/sbdeploy
REMOTE

# 4. healthcheck с ретраями
echo "==> healthcheck $HEALTH_URL"
for _ in $(seq 1 10); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "healthz: ok"
    exit 0
  fi
  sleep 2
done

echo "healthz: FAILED — '$SSH $VM_HOST sudo journalctl -u sb-bot -n 50'" >&2
exit 1

#!/usr/bin/env bash
# Eenmalig op de Hetzner-server draaien (als de user die de site mag schrijven).
# Maakt een deploy-sleutel. Output is te parsen door scripts/finish-deploy-from-mac.sh.
set -euo pipefail

KEY_DIR="${HOME}/.ssh"
KEY_FILE="${KEY_DIR}/github-deploy-tst"
HOST_IP="$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
SITE_PATH="${DEPLOY_PATH:-}"

find_docroot() {
  local conf=""
  for dir in /etc/apache2/sites-enabled /etc/apache2/sites-available; do
    [ -d "$dir" ] || continue
    conf="$(grep -lR --include='*.conf' 'tst.vantuyl.it' "$dir" 2>/dev/null | head -1 || true)"
    [ -n "$conf" ] && break
  done
  if [ -n "$conf" ]; then
    awk '/^[[:space:]]*DocumentRoot/{print $2; exit}' "$conf"
  fi
}

if [ -z "${SITE_PATH}" ]; then
  SITE_PATH="$(find_docroot || true)"
  SITE_PATH="${SITE_PATH:-/var/www/tst.vantuyl.it}"
fi

if [ ! -d "${SITE_PATH}" ]; then
  echo "Waarschuwing: ${SITE_PATH} bestaat niet. Zet DEPLOY_PATH=... en run opnieuw." >&2
fi

mkdir -p "${KEY_DIR}"
chmod 700 "${KEY_DIR}"
if [ ! -f "${KEY_FILE}" ]; then
  ssh-keygen -t ed25519 -N "" -C "github-deploy-tst.vantuyl.it" -f "${KEY_FILE}"
fi

AUTH="${KEY_DIR}/authorized_keys"
touch "${AUTH}"
chmod 600 "${AUTH}"
PUB="$(cat "${KEY_FILE}.pub")"
grep -qxF "${PUB}" "${AUTH}" || echo "${PUB}" >> "${AUTH}"

echo "---BEGIN SECRETS---"
echo "DEPLOY_HOST=${HOST_IP}"
echo "DEPLOY_USER=$(whoami)"
echo "DEPLOY_PATH=${SITE_PATH}"
echo "---END SECRETS---"
echo "---BEGIN DEPLOY_KEY---"
cat "${KEY_FILE}"
echo "---END DEPLOY_KEY---"

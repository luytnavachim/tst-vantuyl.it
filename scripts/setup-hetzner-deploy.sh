#!/usr/bin/env bash
# Eenmalig op de Hetzner-server draaien (als root of de user die de site mag schrijven).
# Maakt een deploy-sleutel en toont de waarden voor GitHub Actions secrets.
set -euo pipefail

KEY_DIR="${HOME}/.ssh"
KEY_FILE="${KEY_DIR}/github-deploy-tst"
HOST_IP="$(curl -fsS --max-time 5 https://ifconfig.me || hostname -I | awk '{print $1}')"
SITE_PATH="${DEPLOY_PATH:-}"

if [ -z "${SITE_PATH}" ]; then
  if command -v apache2ctl >/dev/null 2>&1; then
    SITE_PATH="$(apache2ctl -S 2>/dev/null | awk '/tst\.vantuyl\.it/{f=1} f && /port/{print}' | head -1 || true)"
  fi
  if [ -z "${SITE_PATH}" ] && [ -d /etc/apache2/sites-enabled ]; then
    SITE_PATH="$(grep -Rhs 'DocumentRoot' /etc/apache2/sites-enabled 2>/dev/null | awk '{print $2}' | head -1 || true)"
  fi
  SITE_PATH="${SITE_PATH:-/var/www/tst.vantuyl.it}"
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

echo
echo "Klaar. Zet deze secrets in GitHub:"
echo "  repo → Settings → Secrets and variables → Actions"
echo
echo "DEPLOY_HOST"
echo "${HOST_IP}"
echo
echo "DEPLOY_USER"
echo "$(whoami)"
echo
echo "DEPLOY_PATH"
echo "${SITE_PATH}"
echo
echo "DEPLOY_KEY"
echo "(plak de hele private key hieronder, inclusief BEGIN/END regels)"
echo
cat "${KEY_FILE}"
echo

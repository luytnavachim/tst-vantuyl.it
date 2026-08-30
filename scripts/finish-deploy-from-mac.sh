#!/usr/bin/env bash
# Run dit op de iMac (Cursor daar heeft SSH naar Hetzner + gh).
# 1. Zoekt de bestaande SSH-verbinding
# 2. Zet de deploy-sleutel op de server
# 3. Schrijft GitHub Actions secrets
# 4. Start de deploy-workflow
set -euo pipefail

REPO="${DEPLOY_REPO:-luytnavachim/tst-vantuyl.it}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_SCRIPT="/tmp/setup-hetzner-deploy.sh"
CANDIDATES=()

if [ -n "${DEPLOY_SSH:-}" ]; then
  CANDIDATES+=("${DEPLOY_SSH}")
fi
CANDIDATES+=(tst.vantuyl.it vantuyl.it hetzner hetzner-vantuyl 95.217.203.120)

if [ -f "${HOME}/.ssh/config" ]; then
  while read -r host; do
    [ -n "$host" ] || continue
    CANDIDATES+=("$host")
  done < <(awk 'tolower($1)=="host"{for(i=2;i<=NF;i++) if($i !~ /[*?]/) print $i}' "${HOME}/.ssh/config")
fi

uniq_candidates=()
seen="|"
for c in "${CANDIDATES[@]}"; do
  case "$seen" in
    *"|$c|"*) continue ;;
  esac
  seen="${seen}${c}|"
  uniq_candidates+=("$c")
done

SSH_TARGET=""
echo "Zoeken naar Hetzner-SSH vanaf deze Mac..."
for target in "${uniq_candidates[@]}"; do
  if ssh -o BatchMode=yes -o ConnectTimeout=6 -o StrictHostKeyChecking=accept-new "$target" "true" >/dev/null 2>&1; then
    SSH_TARGET="$target"
    echo "Gevonden: ${SSH_TARGET}"
    break
  fi
done

if [ -z "${SSH_TARGET}" ]; then
  echo "Geen werkende SSH-host gevonden."
  echo "Run opnieuw met: DEPLOY_SSH=user@host $0"
  echo "Getest: ${uniq_candidates[*]}"
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) ontbreekt. Installeer die eerst op de iMac."
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "gh is niet ingelogd. Run op de iMac: gh auth login"
  exit 1
fi

scp -q "${ROOT}/scripts/setup-hetzner-deploy.sh" "${SSH_TARGET}:${REMOTE_SCRIPT}"
chmod_out="$(ssh "$SSH_TARGET" "chmod +x ${REMOTE_SCRIPT} && bash ${REMOTE_SCRIPT}")"
echo "$chmod_out"

host="$(printf '%s\n' "$chmod_out" | awk -F= '/^DEPLOY_HOST=/{print $2; exit}')"
user="$(printf '%s\n' "$chmod_out" | awk -F= '/^DEPLOY_USER=/{print $2; exit}')"
path="$(printf '%s\n' "$chmod_out" | awk -F= '/^DEPLOY_PATH=/{print $2; exit}')"
key="$(printf '%s\n' "$chmod_out" | awk '/---BEGIN DEPLOY_KEY---/{p=1;next} /---END DEPLOY_KEY---/{p=0} p')"

if [ -z "$host" ] || [ -z "$user" ] || [ -z "$path" ] || [ -z "$key" ]; then
  echo "Kon de secret-waarden niet uit de server-output lezen."
  exit 1
fi

echo "GitHub secrets zetten voor ${REPO}..."
printf '%s\n' "$host" | gh secret set DEPLOY_HOST --repo "$REPO"
printf '%s\n' "$user" | gh secret set DEPLOY_USER --repo "$REPO"
printf '%s\n' "$path" | gh secret set DEPLOY_PATH --repo "$REPO"
printf '%s\n' "$key" | gh secret set DEPLOY_KEY --repo "$REPO"

echo "Deploy-workflow starten..."
if gh workflow run deploy.yml --repo "$REPO" --ref main; then
  echo "Workflow gestart op main."
else
  echo "Workflow staat nog op de PR-branch. Merge PR #2 eerst, of run:"
  echo "  gh workflow run deploy.yml --repo ${REPO} --ref cursor/hetzner-deploy-3009"
fi

echo
echo "Klaar. Controleer daarna https://tst.vantuyl.it (hard refresh)."
echo "SSH-target: ${SSH_TARGET}"
echo "Deploy path: ${path}"
echo "Deploy user: ${user}"

#!/bin/bash
set -euo pipefail
cd /var/www/tst-vantuyl.it
export GIT_SSH_COMMAND="ssh -i /root/.ssh/id_ed25519_tst -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
git fetch origin
git reset --hard origin/main
echo "$(date -Is) $(git rev-parse --short HEAD)" >> /var/log/tst-vantuyl-sync.log

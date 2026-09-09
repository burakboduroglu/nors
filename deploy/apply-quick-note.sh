#!/usr/bin/env bash
# Deploy the Nors build that understands ?new=1, then add the Glance shortcut.
# Runs ON penolox-server, with sudo:
#   ssh -t hetzner 'sudo bash /tmp/nors-quick-note/apply.sh'
set -euo pipefail

STAGE=/tmp/nors-quick-note

bash "$STAGE/install.sh" "$STAGE"
bash "$STAGE/glance/apply-glance-nors.sh" "$STAGE/glance"

curl -s -o /dev/null -w "nors %{http_code}\n" http://127.0.0.1:8090/nors/

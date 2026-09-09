#!/usr/bin/env bash
# Deploy the Nors build that understands ?new=1, then add the Glance shortcut.
# Runs ON penolox-server, with sudo:
#   ssh -t hetzner 'sudo bash /tmp/nors-quick-note.sh'
set -euo pipefail

bash /tmp/nors-stage/install.sh /tmp/nors-stage
bash /tmp/nors-glance-nors/apply-glance-nors.sh

curl -s -o /dev/null -w "nors %{http_code}\n" http://127.0.0.1:8090/nors/

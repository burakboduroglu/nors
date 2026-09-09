#!/usr/bin/env bash
# Nors Glance apply — runs ON penolox-server, with sudo.
# One short invocation so paste-wrapping terminals cannot split it:
#   ssh -t hetzner 'sudo bash /tmp/nors-glance-nors/apply-glance-nors.sh'
# Idempotent: patch re-run is a no-op, install/restart are safe to repeat.
set -euo pipefail

STAGE="${1:-/tmp/nors-glance-nors}"

install -m 644 "$STAGE/nors-mark-512.png" /opt/glance/assets/nors.png
ls -la /opt/glance/assets/nors.png
python3 "$STAGE/patch-glance-nors.py"
systemctl restart glance
sleep 1
systemctl is-active glance
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/

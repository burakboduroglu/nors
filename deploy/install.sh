#!/usr/bin/env bash
# Nors install — runs ON penolox-server, with sudo.
# PB deploy order is stop -> copy -> start (restart on changed
# migrations/hooks hangs for the full TimeoutStopSec).
set -euo pipefail

STAGE="${1:?usage: sudo ./install.sh <stagedir>}"
MIG=/opt/pocketbase/pb_migrations
PUB=/opt/pocketbase/pb_public/nors

systemctl stop pocketbase

cp "$STAGE"/pb_migrations/*.js "$MIG"/
chown --reference="$MIG" "$MIG"/*.js

rm -rf "$PUB"
cp -r "$STAGE"/pb_public/nors "$PUB"
chown -R --reference="$(dirname "$PUB")" "$PUB"

systemctl start pocketbase
systemctl is-active pocketbase

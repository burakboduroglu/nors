# Deploy — Glance Nors bookmark

Agents do not SSH-write. Paste these on the Mac, one block at a time.
Apply **after** the Nors UI deploy (`deploy/install.sh` + Access app for
`/nors`) — before that `/nors/` is 404 and the bookmark is a dead link.

Current server state (2026-09-09): Apps page live with Skadi widget +
Skadi bookmark, `/subs/` 200, `/nors/` 404, no `nors.png` in
`/opt/glance/assets/`. The patch below was dry-run against a copy of the
live `glance.yml`: inserts 3 lines, re-run is a no-op.

## 0 — Pre-check (do not skip)

```bash
ssh hetzner 'curl -s -o /dev/null -w "nors:%{http_code}\n" http://127.0.0.1:8090/nors/'
```

Expect `nors:200`. If `404`, deploy the UI first, then come back here.

## 1 — Stage files on the server

Keep the remote path on **one line** ending with `/` so scp creates/uses a
directory.

```bash
ssh hetzner 'mkdir -p /tmp/nors-glance-nors'

scp ~/projects/nors/deploy/patch-glance-nors.py \
    ~/projects/nors/assets/nors-mark-512.png \
    hetzner:/tmp/nors-glance-nors/
```

## 2 — Install Nors icon into Glance assets

```bash
ssh -t hetzner 'sudo install -m 644 /tmp/nors-glance-nors/nors-mark-512.png /opt/glance/assets/nors.png && ls -la /opt/glance/assets/nors.png'
```

## 3 — Patch glance.yml (adds Nors bookmark after Skadi)

```bash
ssh -t hetzner 'sudo python3 /tmp/nors-glance-nors/patch-glance-nors.py'
```

Expected: backup path printed, "inserted Nors bookmark after line 288
(Apps page, Live group)". A second run prints "already up to date".

## 4 — Restart and verify

```bash
ssh -t hetzner 'sudo systemctl restart glance && sleep 1 && systemctl is-active glance && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/'
```

`000` right after restart is usually timing — wait a second and curl again.
Expect `active` and `200`.

Then open Glance in the browser: **Apps → Live** shows Skadi + Nors;
both open their app behind Access.

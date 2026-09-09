# Deploy — Glance Apps page

Agents do not SSH-write. Paste these on the Mac, one block at a time.

## 1 — Stage files on the server

Keep the remote path on **one line** ending with `/` so scp creates/uses a
directory. A wrapped `hetzner:/tmp/nors-gla` (truncated) was a real failure mode.

```bash
ssh hetzner 'mkdir -p /tmp/nors-glance'

scp ~/projects/nors/deploy/patch-glance-apps.py \
    ~/projects/nors/deploy/widget.tr.yml \
    ~/projects/skadi/assets/logo.png \
    hetzner:/tmp/nors-glance/
```

If an earlier attempt left files under `/tmp/nors-gla/`, either use that path
below or copy across:

```bash
ssh hetzner 'cp -a /tmp/nors-gla/. /tmp/nors-glance/ && ls -la /tmp/nors-glance'
```

## 2 — Install Skadi icon into Glance assets

```bash
ssh -t hetzner 'sudo install -m 644 /tmp/nors-glance/logo.png /opt/glance/assets/skadi.png && ls -la /opt/glance/assets/skadi.png'
```

## 3 — Patch glance.yml (creates Apps, moves Skadi widget)

```bash
ssh -t hetzner 'sudo python3 /tmp/nors-glance/patch-glance-apps.py'
```

Expected: backup path printed, "inserted Apps page … before Services".

## 4 — Restart and verify

```bash
ssh -t hetzner 'sudo systemctl restart glance && sleep 1 && systemctl is-active glance && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/'
```

`000` right after restart is usually timing — wait a second and curl again.
Expect `active` and `200`.

Then open Glance in the browser: nav should read **Home · Apps · Services**,
Apps shows the Skadi widget + Skadi bookmark, Services no longer has the
Abonelikler widget.

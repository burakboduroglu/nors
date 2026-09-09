# Deploy — Glance Nors bookmark + Quick note widget

Short version (wrap-proof, one password prompt):

```bash
ssh -t hetzner 'sudo bash /tmp/nors-quick-note/apply.sh'
```

Expect: Caddy guard validated → PocketBase `active` → `nors.png` listed →
`ensured Nors bookmark and Quick note widget` → Glance `active` + `200`.
Then open Glance: **Apps** shows the Nors summary card under subscriptions,
while **Apps → Live** shows the Nors bookmark.
Details below; agents do not SSH-write, Burak pastes.
Apply **after** the Nors UI deploy and Access setup (`deploy/install.sh` plus
Access apps for `/nors` and `/api/collections/nors_notes`) — before both are
ready the bookmark is either dead or points at an unprotected login surface.

Current server state (2026-09-09): Access protects Nors, the Nors bookmark/icon
are live, and the first decorative HTML Quick note card was rejected. The
replacement is a Skadi-style summary widget backed by a loopback-only endpoint;
the patch upgrades the old managed card in place and is a no-op on re-run.

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
    ~/projects/nors/deploy/apply-glance-nors.sh \
    ~/projects/nors/assets/nors-mark-512.png \
    hetzner:/tmp/nors-glance-nors/
```

## 2 — Install Nors icon into Glance assets

```bash
ssh -t hetzner 'sudo install -m 644 /tmp/nors-glance-nors/nors-mark-512.png /opt/glance/assets/nors.png && ls -la /opt/glance/assets/nors.png'
```

## 3 — Patch glance.yml (adds the Nors bookmark + Quick note widget)

```bash
ssh -t hetzner 'sudo python3 /tmp/nors-glance-nors/patch-glance-nors.py'
```

Expected: backup path printed, "ensured Nors bookmark and Quick note widget
(Apps page)". A second run prints "already up to date".

## 4 — Restart and verify

```bash
ssh -t hetzner 'sudo systemctl restart glance && sleep 1 && systemctl is-active glance && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/'
```

`000` right after restart is usually timing — wait a second and curl again.
Expect `active` and `200`.

Then open Glance in the browser: **Apps** shows Nors under subscriptions with
total/draft/pinned counts, five recent notes, and a new-note link. Glance reads
the summary over loopback. Caddy returns 404 for the same public path.

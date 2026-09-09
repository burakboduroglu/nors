# Deploy — Glance Nors bookmark

Short version (wrap-proof, one password prompt):

```bash
ssh -t hetzner 'sudo bash /tmp/nors-glance-nors/apply-glance-nors.sh'
```

Expect: `nors.png` listed → `ensured Nors and Quick note bookmarks` →
`active` + `200`. Then open Glance: **Apps → Live** shows Skadi + Nors.
Details below; agents do not SSH-write, Burak pastes.
Apply **after** the Nors UI deploy and Access setup (`deploy/install.sh` plus
Access apps for `/nors` and `/api/collections/nors_notes`) — before both are
ready the bookmark is either dead or points at an unprotected login surface.

Current server state (2026-09-09): Apps page live with Skadi widget +
Skadi bookmark, `/subs/` 200, `/nors/` 200 with the same HTML hash as the local
build. The public Nors URL still returns 200 without an Access challenge; add
Access before applying this bookmark. Glance has no Nors link and no `nors.png`
in `/opt/glance/assets/`. The patch below was dry-run against a copy of the live
`glance.yml`: inserts 3 lines, re-run is a no-op.

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

## 3 — Patch glance.yml (adds Nors + Quick note after Skadi)

```bash
ssh -t hetzner 'sudo python3 /tmp/nors-glance-nors/patch-glance-nors.py'
```

Expected: backup path printed, "ensured Nors and Quick note bookmarks
(Apps page, Live group)". A second run prints "already up to date".

## 4 — Restart and verify

```bash
ssh -t hetzner 'sudo systemctl restart glance && sleep 1 && systemctl is-active glance && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/'
```

`000` right after restart is usually timing — wait a second and curl again.
Expect `active` and `200`.

Then open Glance in the browser: **Apps → Live** shows Skadi + Nors;
both open their app behind Access.

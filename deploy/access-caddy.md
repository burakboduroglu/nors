# Nors — Access + Caddy notes (penolox-server)

Caddy already reverse-proxies everything to PocketBase on 127.0.0.1:8090,
so `pb_public/nors/` is served at `/nors/` with no Caddyfile change —
same as `/subs/`. `redir / /_/` does not touch subpaths.

## Cloudflare Access (dashboard, Burak pastes)

Mirror the `/subs` setup:

1. Application for `bbp.burakboduroglu.com.tr/nors` — same PIN policy.
2. Application for `bbp.burakboduroglu.com.tr/api/collections/nors_notes`.
3. Keep the loopback-only widget endpoint off the edge:
   `respond /api/nors/summary 404`. The staged deploy applies and validates
   this guard before installing the PocketBase hook.
```bash
# Mac: stage, send, install
cd ~/Projects/nors && bun run build
rm -rf /tmp/nors-stage && mkdir -p /tmp/nors-stage
cp -r pb_migrations pb_hooks pb_public deploy/install.sh /tmp/nors-stage/
scp -r /tmp/nors-stage hetzner:/tmp/
ssh hetzner
# on the box:
sudo /tmp/nors-stage/install.sh /tmp/nors-stage
```

Seeds go through the API, not the installer:

```bash
# tunnel up, then on the Mac:
NORS_PB_URL=http://127.0.0.1:8090 NORS_PB_EMAIL=... NORS_PB_PASSWORD=... \
  bun run import-seeds
```

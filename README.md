# Nors

Personal ops notes that ride an existing PocketBase. Norse-named (not `opsnotes`).

## What it is

Not an application you deploy: one migration, a static page, and three seed
notes that you copy into a PocketBase you already run. No container, no second
database, no extra port — the database, auth, HTTP server and backups are
already there. Notes are cards on a dashboard; an agent drafts, you publish.
Bodies are markdown with Mermaid fences, quoted in the reader on demand.

## Highlights

- Dashboard with kind tabs (Diagram / Runbook / Reference / Scratch), pinning,
  and native HTML5 drag-and-drop reorder — no DnD library.
- Reader renders markdown; Mermaid loads only when a fence is present.
- Editor in the dev.to arrangement: big title, kind pills, icon toolbar,
  Write/Preview, autoslug and auto-summary — title, kind, pinned and body is
  all you ever type.
- Dirty guard asks before navigating away from unsaved edits.
- 44 px touch targets, visible focus, reduced-motion respected.

## Footprint

Measured with `du`:

| | |
| --- | --- |
| Installed files | **3.5 MB** — migration 4 KB, page the rest |
| First visit | **~87 KB** — entry JS ~79 KB (gzip ~24 KB), CSS ~7.5 KB |
| The other 3.4 MB | Mermaid diagram chunks, fetched only when a reader page holds a ` ```mermaid ` fence |
| Database growth | one `nors_notes` row per note, inside the existing `pb_data` |
| Extra processes | none |
| Extra ports | none |

If PocketBase is already running, the marginal cost of Nors is the file sizes.

## Install

Copy the migration and the built page onto the box, then restart PocketBase so
the migration runs. **If it was already running, stop it before copying and
start it afterwards** — PocketBase watches `pb_hooks` and restarts itself when
those change, which races a service manager doing the same. A `deploy/`
installer does the copy in that order:

```bash
scp -r pb_migrations pb_public deploy/install.sh host:/tmp/nors-stage/
ssh host
sudo /tmp/nors-stage/install.sh /tmp/nors-stage
```

The page is served at `/nors/`. Gate `/nors` and
`/api/collections/nors_notes` in Cloudflare Access the way `/subs/` is gated
(see `deploy/access-caddy.md`). Then load the three seed notes through the API:

```bash
NORS_PB_URL=https://your.host NORS_PB_EMAIL=... NORS_PB_PASSWORD=... \
  bun run import-seeds
```

The import is an upsert by slug — safe to re-run.

## How it works

```
browser ──▶ /nors/                            static page, superuser login
browser ──▶ /api/collections/nors_notes/*      superuser only, CRUD + reorder
agent   ──▶ drafts markdown ──▶ editor ──▶ publish
```

Routes are hashes: `#/` dashboard, `#/n/<slug>` reader,
`#/edit/<slug|$new>` editor. Slug and summary derive themselves — the slug
from the title, the summary from the first clean body line.

## Security

The `nors_notes` collection has null API rules, which in PocketBase means
superuser only. The dashboard holds a superuser token in localStorage — the
same tradeoff Skadi makes, documented rather than hidden: anyone with the
browser profile has the keys. There is no audit log and no second user; this
is a single-operator surface behind Cloudflare Access, not a multi-user app.

## What it deliberately does not do

No in-app LLM calls. No public notes or team sharing. No wiki search, tag
graph, or version history UI. No reminders. It does not replace a vault or a
knowledge base — it is the live dashboard above them.

## Stack

PocketBase for storage, auth and HTTP. SolidJS + Vite UI compiled to static
files under `pb_public/nors/`. `marked` for markdown, Mermaid on demand, no
CSS library, no UI server. Bun as the package manager.

## Develop the UI

Source lives in `web/`. The shipped page is built output:

```bash
bun --cwd web install
bun run build      # root script — emits pb_public/nors/
bun run dev        # local UI; /api proxied to :8090 (NORS_PB_PORT to move it)
```

Against a tunneled production box: `ssh -N -L 8090:127.0.0.1:8090 host`,
then `bun run dev` — the browser stays on localhost, so neither CORS nor
Cloudflare Access is in the path.

## License

MIT — see [LICENSE](LICENSE).

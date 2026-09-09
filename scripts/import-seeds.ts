// Idempotent seed import — upsert by slug.
// Usage (tunnel up, PB reachable):
//   NORS_PB_URL=http://127.0.0.1:8090 NORS_PB_EMAIL=... NORS_PB_PASSWORD=... \
//     bun scripts/import-seeds.ts

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

function must(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing env ${name}`)
  return v
}

const PB_URL = must('NORS_PB_URL').replace(/\/$/, '')
const EMAIL = must('NORS_PB_EMAIL')
const PASSWORD = must('NORS_PB_PASSWORD')

type Seed = {
  title: string
  slug: string
  summary: string
  body: string
  kind: string
  tags: string[]
  pinned: boolean
  status: string
  sort: number
}

function parseValue(raw: string): string | string[] | boolean | number {
  const v = raw.trim()
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim()
    return inner ? inner.split(',').map((s) => s.trim()) : []
  }
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+$/.test(v)) return Number(v)
  return v
}

function parseSeed(text: string): Seed {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error('seed lacks frontmatter')
  const front: Record<string, string | string[] | boolean | number> = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i < 0) continue
    front[line.slice(0, i).trim()] = parseValue(line.slice(i + 1))
  }
  const str = (k: string, fallback = '') =>
    typeof front[k] === 'string' ? (front[k] as string) : fallback
  const tags = front.tags
  return {
    title: str('title'),
    slug: str('slug'),
    summary: str('summary'),
    body: m[2].trim() + '\n',
    kind: str('kind', 'scratch'),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    pinned: front.pinned === true,
    status: str('status', 'draft'),
    sort: typeof front.sort === 'number' ? front.sort : 0,
  }
}

async function main(): Promise<void> {
  const login = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  })
  if (!login.ok) throw new Error(`login failed (${login.status})`)
  const token = ((await login.json()) as { token: string }).token
  const headers = { Authorization: token, 'Content-Type': 'application/json' }

  const dir = join(import.meta.dir, '..', 'seeds')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()
  for (const file of files) {
    const seed = parseSeed(await Bun.file(join(dir, file)).text())
    if (!seed.title || !seed.slug) throw new Error(`${file}: title/slug required`)
    const found = (await (
      await fetch(`${PB_URL}/api/collections/nors_notes/records?filter=${encodeURIComponent(`slug = "${seed.slug}"`)}`, {
        headers,
      })
    ).json()) as { items: Array<{ id: string }> }
    if (found.items.length > 0) {
      const res = await fetch(`${PB_URL}/api/collections/nors_notes/records/${found.items[0].id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(seed),
      })
      if (!res.ok) throw new Error(`${file}: update failed (${res.status})`)
      console.log(`updated ${seed.slug}`)
    } else {
      const res = await fetch(`${PB_URL}/api/collections/nors_notes/records`, {
        method: 'POST',
        headers,
        body: JSON.stringify(seed),
      })
      if (!res.ok) throw new Error(`${file}: create failed (${res.status})`)
      console.log(`created ${seed.slug}`)
    }
  }
}

await main()

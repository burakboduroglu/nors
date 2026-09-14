/** Minimal PocketBase REST client — no SDK (micro). */

const TOKEN_KEY = 'nors_pb_token'
const USER_KEY = 'nors_pb_user'

export type NoteStatus = 'draft' | 'published' | 'archived'
export const NOTE_KINDS = ['diagram', 'runbook', 'reference', 'scratch'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]
export const KIND_LABELS: Record<NoteKind, string> = {
  diagram: 'Diagram',
  runbook: 'Runbook',
  reference: 'Reference',
  scratch: 'Scratch',
}

export type NorsNote = {
  id: string
  title: string
  slug: string
  summary: string
  body: string
  kind: NoteKind
  tags: string[]
  pinned: boolean
  status: NoteStatus
  sort: number
  updated: string
}

function baseUrl(): string {
  // Same origin when served from PB; override for local vite proxy if needed.
  const fromEnv = import.meta.env.VITE_PB_URL as string | undefined
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return ''
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/** Fired on window when PocketBase rejects the stored token; App returns to login. */
export const SESSION_EXPIRED = 'nors:session-expired'

const ACCESS_RELOAD_KEY = 'nors_access_reload'

/**
 * fetch that survives Cloudflare Access. An expired Access session answers API
 * calls with a cross-origin redirect to the Access login, which fetch cannot
 * follow; reloading lets the browser run that login. The pending promise never
 * settles so callers show no error toast in the moment before the reload.
 */
async function edgeFetch(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${baseUrl()}${path}`, { ...init, redirect: 'manual' })
  if (res.type === 'opaqueredirect') {
    // Reload once; if Access still redirects right after, stop instead of looping.
    const last = Number(sessionStorage.getItem(ACCESS_RELOAD_KEY) || 0)
    if (Date.now() - last < 30_000) throw new Error('Cloudflare Access session expired. Reload the page to sign in again.')
    sessionStorage.setItem(ACCESS_RELOAD_KEY, String(Date.now()))
    location.reload()
    return new Promise<Response>(() => {})
  }
  return res
}

/**
 * Authenticated request. PocketBase treats a missing or expired token as a guest,
 * and the superuser-only nors_notes collection answers guests with 403, not 401,
 * so both codes mean the session is over.
 */
async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  if (!token) return expire()
  const res = await edgeFetch(path, {
    ...init,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
  })
  if (res.status === 401 || res.status === 403) return expire()
  return res
}

function expire(): never {
  clearSession()
  window.dispatchEvent(new Event(SESSION_EXPIRED))
  throw new Error('session expired')
}

export async function login(email: string, password: string): Promise<void> {
  const res = await edgeFetch('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `login failed (${res.status})`)
  }
  const data = (await res.json()) as { token: string; record: unknown }
  localStorage.setItem(TOKEN_KEY, data.token)
  localStorage.setItem(USER_KEY, JSON.stringify(data.record))
}

export async function listNotes(opts?: { includeDrafts?: boolean }): Promise<NorsNote[]> {
  const filter = opts?.includeDrafts
    ? 'status != "archived"'
    : 'status = "published"'
  const params = new URLSearchParams({
    filter,
    sort: '-pinned,sort,updated',
    perPage: '200',
  })
  const res = await authed(`/api/collections/nors_notes/records?${params}`)
  if (!res.ok) throw new Error(`list failed (${res.status})`)
  const data = (await res.json()) as { items: Array<Record<string, unknown>> }
  return data.items.map(normalize)
}
export async function getNote(slug: string): Promise<NorsNote> {
  const params = new URLSearchParams({ filter: `slug = "${slug}"` })
  const res = await authed(`/api/collections/nors_notes/records?${params}`)
  if (!res.ok) throw new Error(`get failed (${res.status})`)
  const data = (await res.json()) as { items: Array<Record<string, unknown>> }
  if (data.items.length === 0) throw new Error(`no note: ${slug}`)
  return normalize(data.items[0])
}

export type NoteInput = {
  title: string
  slug: string
  summary: string
  body: string
  kind: NoteKind
  tags: string[]
  pinned: boolean
  status: NoteStatus
  sort: number
}

export async function saveNote(input: NoteInput, id?: string): Promise<NorsNote> {
  const res = await authed(`/api/collections/nors_notes/records${id ? `/${id}` : ''}`, {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `save failed (${res.status})`)
  }
  return normalize((await res.json()) as Record<string, unknown>)
}

export async function deleteNote(id: string): Promise<void> {
  const res = await authed(`/api/collections/nors_notes/records/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `delete failed (${res.status})`)
  }
}

function normalize(row: Record<string, unknown>): NorsNote {
  const tags = row.tags
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    slug: String(row.slug ?? ''),
    summary: String(row.summary ?? ''),
    body: String(row.body ?? ''),
    kind: (row.kind as NorsNote['kind']) || 'scratch',
    tags: Array.isArray(tags) ? (tags as string[]) : [],
    pinned: Boolean(row.pinned),
    status: (row.status as NorsNote['status']) || 'draft',
    sort: Number(row.sort ?? 0),
    updated: String(row.updated ?? ''),
  }
}

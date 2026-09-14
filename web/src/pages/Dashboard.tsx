import { createEffect, createResource, createSignal, For, Show } from 'solid-js'
import type { Component } from 'solid-js'
import { KIND_LABELS, NOTE_KINDS, listNotes, saveNote } from '../lib/pb'
import type { NoteKind, NorsNote } from '../lib/pb'
import { go } from '../lib/route'
import Toast from '../components/Toast'
import { LoadingBlock, Spinner } from '../components/Spinner'

const STEP = 10

const Dashboard: Component<{ onExpired: () => void }> = (props) => {
  const [err, setErr] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  const [dragId, setDragId] = createSignal<string | null>(null)
  const [overId, setOverId] = createSignal<string | null>(null)
  const [items, setItems] = createSignal<NorsNote[]>([])
  const [kind, setKind] = createSignal<'all' | NoteKind>('all')

  const [notes, { refetch }] = createResource(async () => {
    try {
      return await listNotes({ includeDrafts: true })
    } catch (e) {
      if (e instanceof Error && e.message === 'session expired') props.onExpired()
      else setErr(e instanceof Error ? e.message : String(e))
      return [] as NorsNote[]
    }
  })

  createEffect(() => {
    const n = notes()
    if (n) setItems(n)
  })

  const dragged = () => items().find((n) => n.id === dragId()) ?? null
  const visible = () => {
    const k = kind()
    return k === 'all' ? items() : items().filter((n) => n.kind === k)
  }

  async function persistOrder(next: NorsNote[]): Promise<void> {
    setSaving(true)
    setErr('')
    try {
      let pinned = 0
      let plain = 0
      await Promise.all(
        next.map((n) => {
          const sort = n.pinned ? (pinned += STEP) : (plain += STEP)
          if (sort === n.sort) return Promise.resolve()
          return saveNote(
            {
              title: n.title,
              slug: n.slug,
              summary: n.summary,
              body: n.body,
              kind: n.kind,
              tags: n.tags,
              pinned: n.pinned,
              status: n.status,
              sort,
            },
            n.id,
          )
        }),
      )
      await refetch()
    } catch (e) {
      if (e instanceof Error && e.message === 'session expired') return props.onExpired()
      setErr(e instanceof Error ? e.message : String(e))
      await refetch()
    } finally {
      setSaving(false)
    }
  }

  function onDrop(target: NorsNote, e: DragEvent): void {
    e.preventDefault()
    const d = dragged()
    setDragId(null)
    setOverId(null)
    if (!d || d.id === target.id || d.pinned !== target.pinned) return
    const rest = items().filter((n) => n.id !== d.id)
    const at = rest.findIndex((n) => n.id === target.id)
    const next = [...rest.slice(0, at), d, ...rest.slice(at)]
    setItems(next)
    void persistOrder(next)
  }

  return (
    <main class="dash">
      <Toast message={err()} onDismiss={() => setErr('')} />
      <div class="dash-head">
        <h2>Notes</h2>
        <button
          type="button"
          class="ghost icononly"
          classList={{ spinning: notes.loading }}
          title="Refresh"
          aria-label="Refresh"
          disabled={notes.loading || saving()}
          onClick={() => refetch()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
      <nav class="tabs">
        <button type="button" classList={{ on: kind() === 'all' }} onClick={() => setKind('all')}>
          All
        </button>
        <For each={NOTE_KINDS}>
          {(k) => (
            <button type="button" classList={{ on: kind() === k }} onClick={() => setKind(k)}>
              {KIND_LABELS[k]}
            </button>
          )}
        </For>
      </nav>
      <Show when={notes.loading && items().length === 0}>
        <LoadingBlock label="Loading notes" />
      </Show>
      <Show when={saving()}>
        <p class="hint inline-status">
          <Spinner />
          Saving order…
        </p>
      </Show>
      <Show when={!notes.loading && (notes() || []).length === 0}>
        <div class="empty-wrap">
          <svg width="72" height="56" viewBox="0 0 72 56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <ellipse cx="36" cy="46" rx="22" ry="5" />
            <ellipse cx="36" cy="36" rx="15" ry="6" />
            <ellipse cx="36" cy="26" rx="10" ry="5" />
            <ellipse cx="36" cy="17" rx="5" ry="4" />
          </svg>
          <p>No notes yet</p>
          <button type="button" class="ghost" onClick={() => go('/edit/$new')}>
            Write the first one
          </button>
        </div>
      </Show>
      <ul class="cards">
        <For each={visible()}>
          {(n) => (
            <li
              class="card"
              classList={{
                pinned: n.pinned,
                draft: n.status === 'draft',
                dragging: dragId() === n.id,
                drop: overId() === n.id,
              }}
              draggable={kind() === 'all' && !saving()}
              onDragStart={(e) => {
                setDragId(n.id)
                if (e.dataTransfer) {
                  e.dataTransfer.setData('text/plain', n.id)
                  e.dataTransfer.effectAllowed = 'move'
                }
              }}
              onDragOver={(e) => {
                const d = dragged()
                if (d && d.id !== n.id && d.pinned === n.pinned) {
                  e.preventDefault()
                  setOverId(n.id)
                }
              }}
              onDragLeave={() => {
                if (overId() === n.id) setOverId(null)
              }}
              onDrop={(e) => onDrop(n, e)}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
            >
              <a class="card-link" draggable={false} href={`#/n/${encodeURIComponent(n.slug)}`}>
                <div class="card-top">
                  <span class="kind">{KIND_LABELS[n.kind]}</span>
                  <span class="card-flags">
                    <span class="status">{n.status}</span>
                    <Show when={n.pinned}>
                      <span class="card-pin" title="Pinned" aria-label="Pinned">
                        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M8 3h8l-1 8 3 3v2H6v-2l3-3z" />
                          <line x1="12" y1="16" x2="12" y2="21" />
                        </svg>
                      </span>
                    </Show>
                  </span>
                </div>
                <h3>{n.title}</h3>
                <p>{n.summary || '—'}</p>
                <code class="slug">{n.slug}</code>
              </a>
            </li>
          )}
        </For>
      </ul>
    </main>
  )
}

export default Dashboard

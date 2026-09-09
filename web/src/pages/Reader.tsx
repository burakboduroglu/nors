import { createEffect, createResource, createSignal, Show } from 'solid-js'
import type { Component } from 'solid-js'
import { renderMarkdown, runMermaidDiagrams } from '../lib/md'
import { deleteNote, KIND_LABELS, getNote } from '../lib/pb'
import type { NorsNote } from '../lib/pb'
import { go } from '../lib/route'
import Toast from '../components/Toast'

const Reader: Component<{ slug: string; onExpired: () => void }> = (props) => {
  const [err, setErr] = createSignal('')
  const [deleting, setDeleting] = createSignal(false)
  const [confirmingDelete, setConfirmingDelete] = createSignal(false)
  let bodyEl: HTMLDivElement | undefined

  const [note] = createResource(
    () => props.slug,
    async (slug) => {
      try {
        return await getNote(slug)
      } catch (e) {
        if (e instanceof Error && e.message === 'session expired') props.onExpired()
        else setErr(e instanceof Error ? e.message : String(e))
        return null
      }
    },
  )

  const [rendered] = createResource(note, async (n: NorsNote | null) => {
    if (!n) return { html: '', mermaid: false }
    return renderMarkdown(n.body)
  })

  createEffect(async () => {
    const r = rendered()
    if (!r?.mermaid) return
    await runMermaidDiagrams(bodyEl)
  })

  function formatDate(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value.slice(0, 10)
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date)
  }

  async function onDelete(n: NorsNote): Promise<void> {
    setDeleting(true)
    setErr('')
    try {
      await deleteNote(n.id)
      go('/')
    } catch (e) {
      if (e instanceof Error && e.message === 'session expired') props.onExpired()
      else setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  return (
    <main class="reader">
      <Toast message={err()} onDismiss={() => setErr('')} />
      <Show when={note.loading || rendered.loading}>
        <p class="hint">Loading…</p>
      </Show>
      <Show when={note()}>
        {(n) => (
          <>
            <nav class="reader-nav" aria-label="Note navigation">
              <a class="back-link" href="#/">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                All notes
              </a>
              <div class="reader-actions">
                <button type="button" class="danger-ghost" disabled={deleting()} onClick={() => setConfirmingDelete(true)}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="m19 6-1 14H6L5 6" />
                    <path d="M10 11v5M14 11v5" />
                  </svg>
                  {deleting() ? 'Deleting…' : 'Delete'}
                </button>
                <a class="button-link" href={`#/edit/${encodeURIComponent(n().slug)}`}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                  </svg>
                  Edit note
                </a>
              </div>
            </nav>
            <article class="reader-document">
              <header class="reader-head">
                <div class="reader-badges">
                  <span class="kind badge">{KIND_LABELS[n().kind]}</span>
                  <span class="status badge" classList={{ draft: n().status === 'draft' }}>
                    {n().status === 'draft' ? 'Draft' : n().status === 'archived' ? 'Archived' : 'Published'}
                  </span>
                </div>
                <h1>{n().title}</h1>
                <Show when={n().summary}>
                  <p class="reader-summary">{n().summary}</p>
                </Show>
                <div class="reader-details">
                  <span>Updated {formatDate(n().updated)}</span>
                  <Show when={n().tags.length > 0}>
                    <span class="detail-separator" aria-hidden="true">·</span>
                    <div class="reader-tags" aria-label="Tags">
                      {n().tags.map((t) => (
                        <span class="tag">#{t}</span>
                      ))}
                    </div>
                  </Show>
                </div>
              </header>
              <Show when={n().status === 'draft'}>
                <div class="draft-notice">This note is still a draft.</div>
              </Show>
              <div class="prose reader-prose" ref={bodyEl} innerHTML={rendered()?.html ?? ''} />
            </article>
            <Show when={confirmingDelete()}>
              <div
                class="dialog-backdrop"
                role="presentation"
                onClick={(e) => {
                  if (e.target === e.currentTarget && !deleting()) setConfirmingDelete(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && !deleting()) setConfirmingDelete(false)
                }}
              >
                <section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description">
                  <div class="dialog-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="m19 6-1 14H6L5 6" />
                      <path d="M10 11v5M14 11v5" />
                    </svg>
                  </div>
                  <div class="dialog-copy">
                    <h2 id="delete-title">Delete this note?</h2>
                    <p id="delete-description">
                      <strong>{n().title}</strong> will be permanently deleted. This action cannot be undone.
                    </p>
                  </div>
                  <div class="dialog-actions">
                    <button type="button" class="ghost" autofocus disabled={deleting()} onClick={() => setConfirmingDelete(false)}>
                      Cancel
                    </button>
                    <button type="button" class="danger-confirm" disabled={deleting()} onClick={() => onDelete(n())}>
                      {deleting() ? 'Deleting…' : 'Delete note'}
                    </button>
                  </div>
                </section>
              </div>
            </Show>
          </>
        )}
      </Show>
    </main>
  )
}

export default Reader

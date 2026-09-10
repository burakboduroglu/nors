import { createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { Component } from 'solid-js'
import { renderMarkdown, runMermaidDiagrams } from '../lib/md'
import { KIND_LABELS, NOTE_KINDS, getNote, saveNote } from '../lib/pb'
import type { NoteInput, NorsNote } from '../lib/pb'
import { go, NEW_SLUG } from '../lib/route'
import Toast from '../components/Toast'

function slugify(title: string): string {
  const tr: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }
  return title
    .toLowerCase()
    .replace(/[çğıöşü]/g, (c) => tr[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function blank(): NorsNote {
  return {
    id: '',
    title: '',
    slug: '',
    summary: '',
    body: '',
    kind: 'scratch',
    tags: [],
    pinned: false,
    status: 'draft',
    sort: 0,
    updated: '',
  }
}

const Editor: Component<{ slug: string; onExpired: () => void }> = (props) => {
  const [err, setErr] = createSignal('')

  const [existing] = createResource(
    () => props.slug,
    async (slug) => {
      if (slug === NEW_SLUG) return blank()
      try {
        return await getNote(slug)
      } catch (e) {
        if (e instanceof Error && e.message === 'session expired') props.onExpired()
        else setErr(e instanceof Error ? e.message : String(e))
        return null
      }
    },
  )

  return (
    <main class="editor">
      <Toast message={err()} onDismiss={() => setErr('')} />
      <Show when={existing.loading}>
        <p class="hint">Loading…</p>
      </Show>
      <Show when={existing()}>
        {(n) => <EditorForm initial={n()} onExpired={props.onExpired} />}
      </Show>
    </main>
  )
}

const EditorForm: Component<{ initial: NorsNote; onExpired: () => void }> = (props) => {
  const n = () => props.initial
  const [title, setTitle] = createSignal(n().title)
  const [slug, setSlug] = createSignal(n().slug)
  const [tags, setTags] = createSignal(n().tags.join(', '))
  const [body, setBody] = createSignal(n().body)
  const [kind, setKind] = createSignal(n().kind)
  const [pinned, setPinned] = createSignal(n().pinned)
  const [tab, setTab] = createSignal<'write' | 'preview'>('write')
  const snapshot = () => JSON.stringify([title(), slug(), tags(), body(), kind(), pinned()])
  let base = snapshot()
  let armed = true
  let prevHash = location.hash
  let slugEdited = Boolean(n().id)

  onMount(() => {
    const onHash = () => {
      if (!armed) {
        armed = true
        return
      }
      if (snapshot() === base || confirm('Discard unsaved changes?')) {
        prevHash = location.hash
        return
      }
      armed = false
      if (location.hash !== prevHash) location.hash = prevHash
      else armed = true
    }
    window.addEventListener('hashchange', onHash)
    onCleanup(() => window.removeEventListener('hashchange', onHash))
  })
  const [preview, setPreview] = createSignal('')
  let area: HTMLTextAreaElement | undefined
  let prevEl: HTMLDivElement | undefined

  function refocus(el: HTMLTextAreaElement, s: number, e: number) {
    queueMicrotask(() => {
      el.focus()
      el.setSelectionRange(s, e)
    })
  }

  function surround(before: string, after: string, placeholder: string) {
    const el = area
    if (!el) return
    const v = body()
    const s = el.selectionStart ?? v.length
    const e = el.selectionEnd ?? v.length
    const sel = v.slice(s, e) || placeholder
    setBody(v.slice(0, s) + before + sel + after + v.slice(e))
    setTab('write')
    refocus(el, s + before.length, s + before.length + sel.length)
  }

  function prefixLines(prefix: string) {
    const el = area
    if (!el) return
    const v = body()
    const s = el.selectionStart ?? 0
    const e = el.selectionEnd ?? 0
    const start = v.lastIndexOf('\n', s - 1) + 1
    const stop = v.indexOf('\n', e)
    const tail = stop < 0 ? v.length : stop
    const next = v
      .slice(start, tail)
      .split('\n')
      .map((l) => (l.startsWith(prefix) ? l : prefix + l))
      .join('\n')
    setBody(v.slice(0, start) + next + v.slice(tail))
    setTab('write')
    refocus(el, start, start + next.length)
  }

  function insertMermaid() {
    const template = '\n```mermaid\ngraph TD\n  A --> B\n```\n'
    const el = area
    if (!el) return setBody(body() + template)
    const v = body()
    const s = el.selectionStart ?? v.length
    setBody(v.slice(0, s) + template + v.slice(el.selectionEnd ?? s))
    setTab('write')
    refocus(el, s + template.length, s + template.length)
  }

  async function showPreview() {
    setTab('preview')
    const r = await renderMarkdown(body())
    setPreview(r.html)
    if (!r.mermaid) return
    queueMicrotask(() => runMermaidDiagrams(prevEl))
  }
  const [busy, setBusy] = createSignal(false)
  const [err, setErr] = createSignal('')


  function deriveSummary(v: string): string {
    const line =
      v
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l !== '' && !l.startsWith('#') && !l.startsWith('```')) ?? ''
    return line
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`>#\-[\]()]/g, '')
      .trim()
      .slice(0, 160)
  }

  function parseTags(value: string): string[] {
    return [...new Set(value.split(',').map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean))]
  }

  function collect(status: 'draft' | 'published'): NoteInput {
    const fresh = !n().id
    const heading = title().trim()
    return {
      title: heading,
      slug: slug().trim(),
      summary: fresh ? deriveSummary(body()) : n().summary,
      body: body(),
      kind: kind(),
      tags: parseTags(tags()),
      pinned: pinned(),
      status,
      sort: n().sort,
    }
  }

  async function onSave(status: 'draft' | 'published') {
    if (!title().trim()) return setErr('Title is required.')
    if (!slug().trim()) return setErr('Slug is required.')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug().trim())) {
      return setErr('Slug can only contain lowercase letters, numbers, and single hyphens.')
    }
    const input = collect(status)
    setBusy(true)
    setErr('')
    try {
      const saved = await saveNote(input, n().id || undefined)
      base = snapshot()
      go(`/n/${encodeURIComponent(saved.slug)}`)
    } catch (e) {
      if (e instanceof Error && e.message === 'session expired') props.onExpired()
      else setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Toast message={err()} onDismiss={() => setErr('')} />
      <nav class="crumbs editor-nav">
        <a class="back-link" href="#/">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          All notes
        </a>
        <span class="spacer" />
        <Show when={n().slug}>
          <a class="view-link" href={`#/n/${encodeURIComponent(n().slug)}`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            View note
          </a>
        </Show>
        <button
          type="button"
          class="pinbtn"
          classList={{ on: pinned() }}
          title={pinned() ? 'Unpin' : 'Pin to top'}
          aria-pressed={pinned()}
          onClick={() => setPinned(!pinned())}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={pinned() ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3h8l-1 8 3 3v2H6v-2l3-3z" />
            <line x1="12" y1="16" x2="12" y2="21" />
          </svg>
        </button>
      </nav>
      <input
        class="doctitle"
        placeholder="New note title…"
        value={title()}
        onInput={(e) => {
          const value = e.currentTarget.value
          setTitle(value)
          if (!slugEdited) setSlug(slugify(value))
        }}
        maxlength="160"
        required
      />
      <div class="note-meta-fields">
        <label>
          <span>Slug</span>
          <input
            value={slug()}
            placeholder="note-url"
            maxlength="80"
            spellcheck={false}
            required
            onInput={(e) => {
              slugEdited = true
              setSlug(e.currentTarget.value.toLowerCase())
            }}
          />
          <small>Used in the note URL and on its dashboard card.</small>
        </label>
        <label>
          <span>Tags</span>
          <input
            value={tags()}
            placeholder="server, cli, mac"
            spellcheck={false}
            onInput={(e) => setTags(e.currentTarget.value)}
          />
          <small>Separate tags with commas.</small>
        </label>
      </div>
      <div class="tabs kindpills">
        <For each={NOTE_KINDS}>
          {(k) => (
            <button type="button" classList={{ on: kind() === k }} onClick={() => setKind(k)}>
              {KIND_LABELS[k]}
            </button>
          )}
        </For>
      </div>
      <div class="iconbar">
        <div class="icons">
          <button type="button" title="Bold" aria-label="Bold" onClick={() => surround('**', '**', 'text')}>
            B
          </button>
          <button type="button" title="Italic" aria-label="Italic" onClick={() => surround('*', '*', 'text')}>
            I
          </button>
          <button type="button" title="Link" aria-label="Link" onClick={() => surround('[', '](https://)', 'text')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
          <button type="button" title="List" aria-label="List" onClick={() => prefixLines('- ')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
          <button type="button" title="Numbered list" aria-label="Numbered list" onClick={() => prefixLines('1. ')}>
            <span class="glyph">1.</span>
          </button>
          <button type="button" title="Heading" aria-label="Heading" onClick={() => prefixLines('## ')}>
            H
          </button>
          <button type="button" title="Quote" aria-label="Quote" onClick={() => prefixLines('> ')}>
            <span class="glyph">❝</span>
          </button>
          <button type="button" title="Code" aria-label="Code" onClick={() => surround('`', '`', 'code')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
          <button type="button" title="Mermaid diagram" aria-label="Mermaid diagram" onClick={insertMermaid}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </button>
        </div>
        <div class="minitabs">
          <button type="button" classList={{ on: tab() === 'write' }} onClick={() => setTab('write')}>
            Write
          </button>
          <button type="button" classList={{ on: tab() === 'preview' }} onClick={showPreview}>
            Preview
          </button>
        </div>
      </div>
      <Show when={tab() === 'write'} fallback={<div class="prose preview" ref={prevEl} innerHTML={preview()} />}>
        <textarea
          ref={area}
          class="doctext"
          placeholder="Write your note here…"
          value={body()}
          onInput={(e) => setBody(e.currentTarget.value)}
          rows="8"
        />
      </Show>
      <div class="edit-foot">
        <Show
          when={n().status === 'published'}
          fallback={
            <>
              <button type="button" class="ghost" disabled={busy()} onClick={() => onSave('draft')}>
                {busy() ? '…' : 'Save draft'}
              </button>
              <button type="button" disabled={busy()} onClick={() => onSave('published')}>
                {busy() ? '…' : 'Publish'}
              </button>
            </>
          }
        >
          <button type="button" class="ghost" disabled={busy()} onClick={() => onSave('draft')}>
            {busy() ? '…' : 'Move to drafts'}
          </button>
          <button type="button" disabled={busy()} onClick={() => onSave('published')}>
            {busy() ? '…' : 'Save changes'}
          </button>
        </Show>
      </div>
    </>
  )
}

export default Editor

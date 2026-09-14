import { createEffect, createResource, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import type { Component } from 'solid-js'
import { renderMarkdown, runMermaidDiagrams } from '../lib/md'
import { KIND_LABELS, NOTE_KINDS, getNote, saveNote } from '../lib/pb'
import type { NoteInput, NorsNote } from '../lib/pb'
import { go, NEW_SLUG } from '../lib/route'
import Toast from '../components/Toast'
import { LoadingBlock, Spinner } from '../components/Spinner'

function slugify(title: string): string {
  const tr: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }
  return title
    .toLowerCase()
    .replace(/[çğıöşü]/g, (c) => tr[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'

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
        <LoadingBlock label="Loading note" />
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
    const onUnload = (e: BeforeUnloadEvent) => {
      if (snapshot() !== base) e.preventDefault()
    }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's') return
      e.preventDefault()
      if (!busy()) void onSave(n().status === 'published' ? 'published' : 'draft')
    }
    const onResize = () => fit()
    window.addEventListener('hashchange', onHash)
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    onCleanup(() => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    })
  })
  const [preview, setPreview] = createSignal('')
  const [rendering, setRendering] = createSignal(false)
  let area: HTMLTextAreaElement | undefined
  let prevEl: HTMLDivElement | undefined

  // Grow the textarea with its content so long notes never scroll inside a small box.
  // Restoring scrollY stops the page from jumping while the height is briefly reset.
  function fit() {
    const el = area
    if (!el) return
    const y = window.scrollY
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    window.scrollTo({ top: y })
    if (document.activeElement === el) revealCaret(el)
  }

  // The page, not the textarea, scrolls now, and the sticky footer covers the bottom
  // of the viewport; nudge the page so the caret line stays above it while typing.
  function revealCaret(el: HTMLTextAreaElement) {
    const style = getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight) || 24
    const linesBelow = el.value.slice(el.selectionEnd).split('\n').length - 1
    const rect = el.getBoundingClientRect()
    const caretBottom = rect.bottom - parseFloat(style.paddingBottom) - linesBelow * lineHeight
    const foot = document.querySelector('.edit-foot')?.getBoundingClientRect().top ?? window.innerHeight
    const overlap = caretBottom - (foot - 12)
    if (overlap > 0) window.scrollBy({ top: overlap })
  }

  createEffect(on([body, tab], () => queueMicrotask(fit)))

  // Toolbar actions can switch back from preview, which remounts the textarea,
  // so resolve `area` after the switch instead of capturing the old element.
  function refocus(s: number, e: number) {
    queueMicrotask(() => {
      area?.focus()
      area?.setSelectionRange(s, e)
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
    refocus(s + before.length, s + before.length + sel.length)
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
    refocus(start, start + next.length)
  }

  function insertMermaid() {
    const template = '\n```mermaid\ngraph TD\n  A --> B\n```\n'
    const el = area
    if (!el) return setBody(body() + template)
    const v = body()
    const s = el.selectionStart ?? v.length
    setBody(v.slice(0, s) + template + v.slice(el.selectionEnd ?? s))
    setTab('write')
    refocus(s + template.length, s + template.length)
  }

  function onFormatKey(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
    const key = e.key.toLowerCase()
    if (key === 'b') surround('**', '**', 'text')
    else if (key === 'i') surround('*', '*', 'text')
    else if (key === 'k') surround('[', '](https://)', 'text')
    else return
    e.preventDefault()
  }

  async function showPreview() {
    if (tab() === 'preview') return
    setTab('preview')
    setRendering(true)
    const r = await renderMarkdown(body()).finally(() => setRendering(false))
    if (tab() !== 'preview') return
    setPreview(r.html)
    if (r.mermaid) requestAnimationFrame(() => runMermaidDiagrams(prevEl))
  }
  const [busy, setBusy] = createSignal<'draft' | 'published' | null>(null)
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
    setBusy(status)
    setErr('')
    try {
      const saved = await saveNote(input, n().id || undefined)
      base = snapshot()
      go(`/n/${encodeURIComponent(saved.slug)}`)
    } catch (e) {
      if (e instanceof Error && e.message === 'session expired') props.onExpired()
      else setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
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
      <Show
        when={tab() === 'write'}
        fallback={
          <Show when={!rendering()} fallback={<div class="prose preview"><LoadingBlock label="Rendering preview" /></div>}>
            <div class="prose preview" ref={prevEl} innerHTML={preview()} />
          </Show>
        }
      >
        <textarea
          ref={area}
          class="doctext"
          placeholder="Write your note here…"
          value={body()}
          onInput={(e) => setBody(e.currentTarget.value)}
          onKeyDown={onFormatKey}
        />
      </Show>
      <div class="edit-foot">
        <span class="edit-shortcut">
          <kbd>{MOD_KEY}</kbd>
          <kbd>S</kbd> to save
        </span>
        <button type="button" class="ghost" disabled={busy() !== null} onClick={() => onSave('draft')}>
          <Show when={busy() === 'draft'}>
            <Spinner />
          </Show>
          {n().status === 'published' ? 'Move to drafts' : 'Save draft'}
        </button>
        <button type="button" disabled={busy() !== null} onClick={() => onSave('published')}>
          <Show when={busy() === 'published'}>
            <Spinner />
          </Show>
          {n().status === 'published' ? 'Save changes' : 'Publish'}
        </button>
      </div>
    </>
  )
}

export default Editor

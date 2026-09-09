import { createEffect, createResource, createSignal, Show } from 'solid-js'
import type { Component } from 'solid-js'
import { renderMarkdown, runMermaidDiagrams } from '../lib/md'
import { KIND_LABELS, getNote } from '../lib/pb'
import type { NorsNote } from '../lib/pb'

const Reader: Component<{ slug: string; onExpired: () => void }> = (props) => {
  const [err, setErr] = createSignal('')
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

  return (
    <main class="reader">
      <Show when={err()}>
        <p class="error">{err()}</p>
      </Show>
      <Show when={note.loading || rendered.loading}>
        <p class="hint">Loading…</p>
      </Show>
      <Show when={note()}>
        {(n) => (
          <>
            <nav class="crumbs">
              <a href="#/">← Notes</a>
              <a class="ghost" href={`#/edit/${encodeURIComponent(n().slug)}`}>
                Edit
              </a>
            </nav>
            <p class="meta">
              <span class="kind">{KIND_LABELS[n().kind]}</span>
              <span class="status">{n().status}</span>
              {n().tags.map((t) => (
                <span class="tag">#{t}</span>
              ))}
              <span class="date">Updated {n().updated.slice(0, 10)}</span>
            </p>
            <h2>{n().title}</h2>
            <div class="prose" ref={bodyEl} innerHTML={rendered()?.html ?? ''} />
          </>
        )}
      </Show>
    </main>
  )
}

export default Reader

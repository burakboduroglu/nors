import { marked } from 'marked'
import '../mermaid.css'

let diagramId = 0

export async function renderMarkdown(body: string): Promise<{ html: string; mermaid: boolean }> {
  const html = String(await marked.parse(body ?? ''))
  return { html, mermaid: html.includes('class="language-mermaid"') }
}

export async function runMermaidDiagrams(root: HTMLElement | undefined): Promise<void> {
  if (!root) return
  const nodes = [...root.querySelectorAll<HTMLElement>('pre code.language-mermaid')]
  if (nodes.length === 0) return

  // Mount the frames before the lazy import so each diagram shows a spinner
  // instead of an empty gap while mermaid downloads.
  const diagrams: { frame: HTMLElement; viewport: HTMLElement; source: string }[] = []
  for (const code of nodes) {
    const source = code.textContent ?? ''
    const pre = code.closest('pre')
    if (!pre) continue

    const frame = document.createElement('figure')
    frame.className = 'mermaid-frame is-loading'
    frame.innerHTML = `
      <figcaption class="mermaid-bar">
        <span class="mermaid-label">Diagram</span>
        <button type="button" class="mermaid-zoom" aria-pressed="false">Expand</button>
      </figcaption>
      <div class="mermaid-viewport" tabindex="0" aria-label="Diagram">
        <div class="spin-wrap" role="status" aria-label="Loading diagram"><span class="spin"></span></div>
      </div>
    `
    pre.replaceWith(frame)

    const viewport = frame.querySelector<HTMLElement>('.mermaid-viewport')
    if (!viewport) continue

    frame.querySelector<HTMLButtonElement>('.mermaid-zoom')?.addEventListener('click', (e) => {
      const on = frame.classList.toggle('zoomed')
      const btn = e.currentTarget as HTMLButtonElement
      btn.setAttribute('aria-pressed', String(on))
      btn.textContent = on ? 'Fit' : 'Expand'
    })
    diagrams.push({ frame, viewport, source })
  }

  // Static import would bundle ~2 MB into the main chunk for every visit;
  // micro constraint requires mermaid to load only when a fence is present.
  let mermaid: typeof import('mermaid').default
  try {
    mermaid = (await import('mermaid')).default
  } catch {
    for (const d of diagrams) showDiagramError(d.frame, d.viewport, d.source)
    return
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'base',
    fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
    flowchart: {
      curve: 'basis',
      nodeSpacing: 42,
      rankSpacing: 52,
      padding: 14,
      useMaxWidth: false,
    },
    themeVariables: {
      background: '#12151a',
      primaryColor: '#172431',
      primaryTextColor: '#edf6ff',
      primaryBorderColor: '#6ec8ff',
      secondaryColor: '#20242e',
      secondaryTextColor: '#edf6ff',
      secondaryBorderColor: '#718095',
      tertiaryColor: '#101820',
      tertiaryTextColor: '#edf6ff',
      tertiaryBorderColor: '#526273',
      lineColor: '#91a9bd',
      textColor: '#edf6ff',
      mainBkg: '#172431',
      nodeBorder: '#6ec8ff',
      clusterBkg: '#101820',
      clusterBorder: '#526273',
      edgeLabelBackground: '#12151a',
      noteBkgColor: '#20242e',
      noteTextColor: '#edf6ff',
      noteBorderColor: '#718095',
      actorBkg: '#172431',
      actorBorder: '#6ec8ff',
      actorTextColor: '#edf6ff',
      actorLineColor: '#718095',
      signalColor: '#b9e4ff',
      signalTextColor: '#edf6ff',
      labelBoxBkgColor: '#172431',
      labelBoxBorderColor: '#718095',
      labelTextColor: '#edf6ff',
      loopTextColor: '#edf6ff',
      activationBkgColor: '#20242e',
      activationBorderColor: '#6ec8ff',
      sequenceNumberColor: '#0b0d10',
      fontSize: '15px',
    },
  })

  for (const { frame, viewport, source } of diagrams) {
    try {
      const valid = await mermaid.parse(source, { suppressErrors: true })
      if (!valid) throw new Error('Invalid Mermaid syntax')

      const rendered = await mermaid.render(`nors-diagram-${++diagramId}`, source)
      viewport.innerHTML = rendered.svg
      rendered.bindFunctions?.(viewport)

      const svg = viewport.querySelector<SVGSVGElement>('svg')
      if (!svg) throw new Error('Mermaid returned no diagram')
      svg.setAttribute('role', 'img')
      svg.setAttribute('aria-label', 'Mermaid diagram')
      svg.removeAttribute('height')
      svg.removeAttribute('width')
      frame.classList.remove('is-loading')
    } catch {
      showDiagramError(frame, viewport, source)
    }
  }
}

function showDiagramError(frame: HTMLElement, viewport: HTMLElement, source: string): void {
  frame.classList.remove('is-loading')
  frame.classList.add('has-error')
  viewport.removeAttribute('tabindex')
  viewport.removeAttribute('aria-label')

  const message = document.createElement('p')
  message.className = 'mermaid-error'
  message.textContent = 'This diagram could not be rendered.'
  const fallback = document.createElement('pre')
  const fallbackCode = document.createElement('code')
  fallbackCode.textContent = source
  fallback.append(fallbackCode)
  viewport.replaceChildren(message, fallback)
}

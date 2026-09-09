import { marked } from 'marked'

export async function renderMarkdown(body: string): Promise<{ html: string; mermaid: boolean }> {
  return { html: String(await marked.parse(body ?? '')), mermaid: /```mermaid/.test(body) }
}

export async function runMermaidDiagrams(root: HTMLElement | undefined): Promise<void> {
  if (!root) return
  const nodes = [...root.querySelectorAll<HTMLElement>('pre code.language-mermaid')]
  if (nodes.length === 0) return
  // Static import would bundle ~2 MB into the main chunk for every visit;
  // micro constraint requires mermaid to load only when a fence is present.
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false })
  await mermaid.run({ nodes })
}

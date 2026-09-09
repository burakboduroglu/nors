import { createSignal, onCleanup, onMount } from 'solid-js'

export type Route =
  | { name: 'dash' }
  | { name: 'read'; slug: string }
  | { name: 'edit'; slug: string }

/** `$new` is the editor sentinel for a fresh note. */
export const NEW_SLUG = '$new'

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/')
  if (parts[0] === 'n' && parts[1]) return { name: 'read', slug: decodeURIComponent(parts[1]) }
  if (parts[0] === 'edit' && parts[1]) return { name: 'edit', slug: decodeURIComponent(parts[1]) }
  return { name: 'dash' }
}

export function go(to: string): void {
  location.hash = to
}
export function useRoute(): () => Route {
  const [route, setRoute] = createSignal<Route>(parseHash(location.hash))
  onMount(() => {
    const onChange = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', onChange)
    onCleanup(() => window.removeEventListener('hashchange', onChange))
  })
  return route
}

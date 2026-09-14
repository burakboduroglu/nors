import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import type { Component } from 'solid-js'
import { clearSession, getToken, login } from './lib/pb'
import { go, NEW_SLUG, useRoute } from './lib/route'
import Dashboard from './pages/Dashboard'
import Reader from './pages/Reader'
import Editor from './pages/Editor'
import Toast from './components/Toast'
import { Spinner } from './components/Spinner'
import './App.css'
const App: Component = () => {
  if (new URLSearchParams(location.search).get('new') === '1') {
    history.replaceState(null, '', `${location.pathname}#/edit/${NEW_SLUG}`)
  }
  const [token, setToken] = createSignal(getToken())
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [err, setErr] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const route = useRoute()
  const [menu, setMenu] = createSignal(false)
  let menuRef: HTMLDivElement | undefined

  onMount(() => {
    const outside = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) setMenu(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false)
    }
    document.addEventListener('click', outside)
    document.addEventListener('keydown', esc)
    onCleanup(() => {
      document.removeEventListener('click', outside)
      document.removeEventListener('keydown', esc)
    })
  })

  const mail = () => {
    token()
    try {
      const raw: unknown = JSON.parse(localStorage.getItem('nors_pb_user') || '{}')
      if (raw && typeof raw === 'object' && 'email' in raw && typeof raw.email === 'string') return raw.email
      return ''
    } catch {
      return ''
    }
  }
  const initial = () => (mail()[0] ?? 'N').toUpperCase()

  async function onLogin(e: Event) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await login(email(), password())
      setToken(getToken())
      setPassword('')
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  function bye() {
    clearSession()
    setToken(null)
  }

  return (
    <div class="shell">
      <Toast message={err()} onDismiss={() => setErr('')} />
      <header class="top">
        <a class="brand" href="#/">
          <img src={`${import.meta.env.BASE_URL}nors-mark.svg`} alt="" width="30" height="30" />
          <h1>Nors</h1>
        </a>
        <Show when={token()}>
          <nav class="row">
            <button type="button" class="muted" onClick={() => go('/edit/$new')}>
              + New
            </button>
            <div class="avatar-wrap" ref={menuRef}>
              <button
                type="button"
                class="avatar"
                aria-label="Account"
                aria-expanded={menu()}
                onClick={() => setMenu(!menu())}
              >
                {initial()}
              </button>
              <Show when={menu()}>
                <div class="menu">
                  <Show when={mail()} fallback={<p class="menu-mail">superuser</p>}>
                    <p class="menu-mail">{mail()}</p>
                  </Show>
                  <button type="button" class="out" onClick={bye}>
                    Sign out
                  </button>
                </div>
              </Show>
            </div>
          </nav>
        </Show>
      </header>
      <Show
        when={token()}
        fallback={
          <div class="center-page">
            <form class="login" onSubmit={onLogin}>
            <h2>Superuser</h2>
            <p class="hint">Same PocketBase account as Skadi. Token stays in this browser.</p>
            <label>
              Email
              <input
                type="email"
                autocomplete="username"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autocomplete="current-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                required
              />
            </label>
            <button type="submit" disabled={busy()}>
              <Show when={busy()}>
                <Spinner />
              </Show>
              {busy() ? 'Signing in…' : 'Enter'}
            </button>
            </form>
          </div>
        }
      >
        {(() => {
          const cur = route()
          if (cur.name === 'read') return <Reader slug={cur.slug} onExpired={bye} />
          if (cur.name === 'edit') return <Editor slug={cur.slug} onExpired={bye} />
          return <Dashboard onExpired={bye} />
        })()}
      </Show>
    </div>
  )
}

export default App

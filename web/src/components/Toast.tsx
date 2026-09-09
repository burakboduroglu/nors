import { createEffect, onCleanup, Show } from 'solid-js'
import type { Component } from 'solid-js'

const Toast: Component<{ message: string; onDismiss: () => void }> = (props) => {
  createEffect(() => {
    if (!props.message) return
    const timer = window.setTimeout(props.onDismiss, 4500)
    onCleanup(() => window.clearTimeout(timer))
  })

  return (
    <Show when={props.message}>
      <div class="toast-region" aria-live="assertive" aria-atomic="true">
        <div class="toast toast-error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{props.message}</span>
          <button type="button" class="toast-close" aria-label="Dismiss notification" onClick={props.onDismiss}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="m18 6-12 12M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </Show>
  )
}

export default Toast

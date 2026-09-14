import type { Component } from 'solid-js'

export const Spinner: Component<{ label?: string }> = (props) => (
  <span
    class="spin sm"
    role={props.label ? 'status' : undefined}
    aria-label={props.label}
    aria-hidden={props.label ? undefined : 'true'}
  />
)

export const LoadingBlock: Component<{ label?: string }> = (props) => (
  <div class="spin-wrap" role="status" aria-label={props.label ?? 'Loading'}>
    <span class="spin" />
  </div>
)

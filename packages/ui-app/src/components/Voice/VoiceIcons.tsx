import type { JSX } from 'solid-js'

interface IconProps {
  class?: string
  size?: number
}

const defaults = (props: IconProps) => ({
  width: props.size ?? 20,
  height: props.size ?? 20,
  class: props.class ?? ''
})

export function MicIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

export function MicOffIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2.5" />
    </svg>
  )
}

export function HeadphonesIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  )
}

export function HeadphonesOffIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2.5" />
    </svg>
  )
}

export function VideoIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <polygon points="23,7 17,12 23,17" />
    </svg>
  )
}

export function VideoOffIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <polygon points="23,7 17,12 23,17" />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2.5" />
    </svg>
  )
}

export function ScreenShareIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <polyline points="9,10 12,7 15,10" />
      <line x1="12" y1="7" x2="12" y2="14" />
    </svg>
  )
}

export function ScreenShareOffIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="9" y1="13" x2="15" y2="7" />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2.5" />
    </svg>
  )
}

export function PhoneOffIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 4 .64 2 2 0 0 1 2 2v3.28a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 5.59 2.5h3.28a2 2 0 0 1 2 1.69 12.84 12.84 0 0 0 .64 4 2 2 0 0 1-.45 2.11z" />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2.5" />
    </svg>
  )
}

export function SignalIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <line x1="6" y1="15" x2="6" y2="20" />
      <line x1="10" y1="11" x2="10" y2="20" />
      <line x1="14" y1="7" x2="14" y2="20" />
      <line x1="18" y1="3" x2="18" y2="20" />
    </svg>
  )
}

export function LoaderIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={`animate-spin ${d.class}`}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

export function SpeakerIcon(props: IconProps): JSX.Element {
  const d = defaults(props)
  return (
    <svg
      width={d.width}
      height={d.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={d.class}
    >
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

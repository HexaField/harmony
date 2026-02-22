import { Show, createSignal, onCleanup, type JSX } from 'solid-js'

export interface TooltipProps {
  text: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  children: JSX.Element
}

export function Tooltip(props: TooltipProps): JSX.Element {
  const [visible, setVisible] = createSignal(false)
  let timeout: ReturnType<typeof setTimeout>

  const show = () => {
    timeout = setTimeout(() => setVisible(true), 300)
  }
  const hide = () => {
    clearTimeout(timeout)
    setVisible(false)
  }

  onCleanup(() => clearTimeout(timeout))

  const posClass = () => {
    switch (props.position ?? 'top') {
      case 'top':
        return 'bottom-full left-1/2 -translate-x-1/2 mb-2'
      case 'bottom':
        return 'top-full left-1/2 -translate-x-1/2 mt-2'
      case 'left':
        return 'right-full top-1/2 -translate-y-1/2 mr-2'
      case 'right':
        return 'left-full top-1/2 -translate-y-1/2 ml-2'
    }
  }

  return (
    <div class="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {props.children}
      <Show when={visible()}>
        <div
          class={`absolute ${posClass()} z-50 px-3 py-1.5 text-sm bg-hm-bg-darkest text-hm-text rounded-md shadow-lg whitespace-nowrap pointer-events-none`}
        >
          {props.text}
        </div>
      </Show>
    </div>
  )
}

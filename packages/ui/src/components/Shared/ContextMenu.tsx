import { Show, For, createSignal, onCleanup, type JSX } from 'solid-js'

export interface ContextMenuItem {
  label: string
  icon?: string
  action: () => void
  danger?: boolean
  separator?: boolean
}

export interface ContextMenuProps {
  items: ContextMenuItem[]
  children: JSX.Element
}

export function ContextMenu(props: ContextMenuProps): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [pos, setPos] = createSignal({ x: 0, y: 0 })

  const handleContext = (e: MouseEvent) => {
    e.preventDefault()
    setPos({ x: e.clientX, y: e.clientY })
    setOpen(true)
  }

  const close = () => setOpen(false)

  const handleClick = (_e: MouseEvent) => {
    if (open()) close()
  }

  if (typeof window !== 'undefined') {
    const handler = () => close()
    window.addEventListener('click', handler)
    onCleanup(() => window.removeEventListener('click', handler))
  }

  return (
    <div onContextMenu={handleContext}>
      {props.children}
      <Show when={open()}>
        <div
          class="fixed z-50 bg-hm-bg-darkest rounded-md shadow-lg py-1.5 min-w-[180px] border border-hm-bg-darker"
          style={{ left: `${pos().x}px`, top: `${pos().y}px` }}
          onClick={handleClick}
        >
          <For each={props.items}>
            {(item) =>
              item.separator ? (
                <div class="my-1 border-t border-hm-bg-darker" />
              ) : (
                <button
                  class={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 ${
                    item.danger
                      ? "text-hm-red hover:bg-hm-red hover:text-white"
                      : "text-hm-text hover:bg-hm-accent hover:text-white"
                  } transition-colors`}
                  onClick={() => item.action()}
                >
                  {item.icon && <span>{item.icon}</span>}
                  {item.label}
                </button>
              )
            }
          </For>
        </div>
      </Show>
    </div>
  )
}

import { Show, For, createSignal, onCleanup, type JSX } from 'solid-js'
import type { ContextMenuItem } from '../Shared/ContextMenu.js'

export interface MessageContextMenuProps {
  isOwn: boolean
  onReply: () => void
  onEdit?: () => void
  onDelete?: () => void
  onReact: (emoji: string) => void
  onPin?: () => void
  onThread?: () => void
  children: JSX.Element
}

export function MessageContextMenu(props: MessageContextMenuProps): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [pos, setPos] = createSignal({ x: 0, y: 0 })

  const items = (): ContextMenuItem[] => {
    const list: ContextMenuItem[] = [
      {
        label: 'Reply',
        icon: '↩',
        action: () => {
          props.onReply()
          setOpen(false)
        }
      },
      {
        label: 'React',
        icon: '😀',
        action: () => {
          props.onReact('👍')
          setOpen(false)
        }
      }
    ]
    if (props.onThread) {
      list.push({
        label: 'Create Thread',
        icon: '🧵',
        action: () => {
          props.onThread!()
          setOpen(false)
        }
      })
    }
    if (props.onPin) {
      list.push({
        label: 'Pin Message',
        icon: '📌',
        action: () => {
          props.onPin!()
          setOpen(false)
        }
      })
    }
    if (props.isOwn) {
      list.push({ label: '', action: () => {}, separator: true })
      if (props.onEdit) {
        list.push({
          label: 'Edit Message',
          icon: '✏',
          action: () => {
            props.onEdit!()
            setOpen(false)
          }
        })
      }
      if (props.onDelete) {
        list.push({
          label: 'Delete Message',
          icon: '🗑',
          action: () => {
            props.onDelete!()
            setOpen(false)
          },
          danger: true
        })
      }
    }
    return list
  }

  const handleContext = (e: MouseEvent) => {
    e.preventDefault()
    setPos({ x: e.clientX, y: e.clientY })
    setOpen(true)
  }

  if (typeof window !== 'undefined') {
    const handler = () => setOpen(false)
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
        >
          <For each={items()}>
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

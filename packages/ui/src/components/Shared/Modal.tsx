import { Show, type JSX } from 'solid-js'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: JSX.Element
}

export function Modal(props: ModalProps): JSX.Element {
  const handleBackdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) props.onClose()
  }

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={handleBackdrop}>
        <div class="bg-hm-bg rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
          <Show when={props.title}>
            <div class="flex items-center justify-between px-4 py-3 border-b border-hm-bg-darker">
              <h2 class="text-lg font-semibold text-white">{props.title}</h2>
              <button class="text-hm-text-muted hover:text-white transition-colors" onClick={() => props.onClose()}>
                ✕
              </button>
            </div>
          </Show>
          <div class="p-4">{props.children}</div>
        </div>
      </div>
    </Show>
  )
}

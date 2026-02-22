import { For, createSignal, type JSX } from 'solid-js'

export interface ToastMessage {
  id: string
  type: 'info' | 'success' | 'error' | 'warning'
  text: string
  duration?: number
}

const [toasts, setToasts] = createSignal<ToastMessage[]>([])

export function addToast(toast: Omit<ToastMessage, 'id'>) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
  setToasts((prev) => [...prev, { ...toast, id }])
  setTimeout(() => removeToast(id), toast.duration ?? 5000)
}

export function removeToast(id: string) {
  setToasts((prev) => prev.filter((t) => t.id !== id))
}

const TYPE_STYLES: Record<string, string> = {
  info: 'bg-hm-accent',
  success: 'bg-hm-green',
  error: 'bg-hm-red',
  warning: 'bg-hm-yellow text-black'
}

export function Toast(): JSX.Element {
  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <For each={toasts()}>
        {(toast) => (
          <div
            class={`${TYPE_STYLES[toast.type]} text-white px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-3 min-w-[280px] animate-slide-in`}
          >
            <span class="flex-1 text-sm">{toast.text}</span>
            <button class="text-white/70 hover:text-white text-lg leading-none" onClick={() => removeToast(toast.id)}>
              ✕
            </button>
          </div>
        )}
      </For>
    </div>
  )
}

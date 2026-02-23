import { For, Show, type JSX } from 'solid-js'
import type { PushNotification } from '@harmony/mobile'

export interface NotificationCenterProps {
  notifications: PushNotification[]
  open: boolean
  onClose: () => void
  onNotificationClick: (notification: PushNotification) => void
  onClearAll: () => void
}

export function useNotificationCenter(props: NotificationCenterProps) {
  return {
    notifications: () => props.notifications,
    count: () => props.notifications.length,
    open: () => props.open,
    close: () => props.onClose(),
    click: (n: PushNotification) => props.onNotificationClick(n),
    clearAll: () => props.onClearAll(),
    hasNotifications: () => props.notifications.length > 0
  }
}

export function NotificationCenter(props: NotificationCenterProps): JSX.Element {
  const ctrl = useNotificationCenter(props)

  return (
    <Show when={ctrl.open()}>
      <div class="fixed inset-0 z-40" onClick={() => ctrl.close()}>
        <div
          class="absolute right-0 top-0 h-full w-80 bg-hm-bg shadow-2xl border-l border-hm-bg-darker flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between px-4 py-3 border-b border-hm-bg-darker">
            <h3 class="text-sm font-semibold text-white">Notifications</h3>
            <div class="flex items-center gap-2">
              <Show when={ctrl.hasNotifications()}>
                <button class="text-xs text-hm-text-muted hover:text-white" onClick={() => ctrl.clearAll()}>
                  Clear all
                </button>
              </Show>
              <button class="text-hm-text-muted hover:text-white" onClick={() => ctrl.close()}>
                ✕
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto">
            <Show when={!ctrl.hasNotifications()}>
              <div class="flex flex-col items-center justify-center h-full gap-2">
                <span class="text-3xl">🔔</span>
                <p class="text-sm text-hm-text-muted">All caught up!</p>
              </div>
            </Show>

            <For each={ctrl.notifications()}>
              {(notification) => (
                <div
                  class="px-4 py-3 hover:bg-hm-bg-dark cursor-pointer transition-colors border-b border-hm-bg-darker"
                  onClick={() => ctrl.click(notification)}
                >
                  <p class="text-sm font-medium text-hm-text">{notification.title}</p>
                  <p class="text-xs text-hm-text-muted mt-1">{notification.body}</p>
                  <p class="text-xs text-hm-text-muted mt-1">
                    {new Date(notification.receivedAt).toLocaleTimeString()}
                  </p>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  )
}

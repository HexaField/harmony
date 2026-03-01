import { createSignal, For, Show, onCleanup, type Component } from 'solid-js'
import { useAppStore } from '../store.js'

export interface NotificationItem {
  id: string
  type: 'mention' | 'reply' | 'system'
  title: string
  body: string
  timestamp: string
  read: boolean
  channelId?: string
  communityId?: string
  messageId?: string
}

const [notifications, setNotifications] = createSignal<NotificationItem[]>([])

export function addNotification(n: Omit<NotificationItem, 'id' | 'read'>) {
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
  setNotifications((prev) => [{ ...n, id, read: false }, ...prev].slice(0, 100))
}

export function markNotificationRead(id: string) {
  setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
}

export function markAllNotificationsRead() {
  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
}

export function getUnreadCount(): number {
  return notifications().filter((n) => !n.read).length
}

export function getNotifications(): NotificationItem[] {
  return notifications()
}

/** Wire notification events from the HarmonyClient */
export function wireNotificationEvents(client: { on: (event: string, handler: (...args: unknown[]) => void) => void }) {
  client.on('notification.new', (...args: unknown[]) => {
    const data = args[0] as {
      type?: string
      title?: string
      body?: string
      channelId?: string
      communityId?: string
      messageId?: string
    }
    addNotification({
      type: (data.type as NotificationItem['type']) ?? 'system',
      title: data.title ?? 'Notification',
      body: data.body ?? '',
      timestamp: new Date().toISOString(),
      channelId: data.channelId,
      communityId: data.communityId,
      messageId: data.messageId
    })
  })

  client.on('notification.list', (...args: unknown[]) => {
    const list = args[0] as NotificationItem[]
    if (Array.isArray(list)) {
      setNotifications(list.slice(0, 100))
    }
  })

  client.on('notification.mark-read', (...args: unknown[]) => {
    const data = args[0] as { id?: string; all?: boolean }
    if (data.all) {
      markAllNotificationsRead()
    } else if (data.id) {
      markNotificationRead(data.id)
    }
  })
}

export const NotificationBell: Component = () => {
  const [open, setOpen] = createSignal(false)
  const store = useAppStore()

  function handleClickOutside(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest('.notification-centre')
    if (!el) setOpen(false)
  }

  if (typeof window !== 'undefined') {
    document.addEventListener('click', handleClickOutside)
    onCleanup(() => document.removeEventListener('click', handleClickOutside))
  }

  const unread = () => getUnreadCount()

  return (
    <div class="notification-centre relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open())
        }}
        class="p-2 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] text-sm relative"
        title="Notifications"
      >
        🔔
        <Show when={unread() > 0}>
          <span class="absolute -top-0.5 -right-0.5 bg-[var(--error)] text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {unread() > 99 ? '99+' : unread()}
          </span>
        </Show>
      </button>

      <Show when={open()}>
        <div class="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl z-50">
          <div class="flex items-center justify-between p-3 border-b border-[var(--border)]">
            <span class="font-semibold text-sm">Notifications</span>
            <Show when={unread() > 0}>
              <button onClick={() => markAllNotificationsRead()} class="text-xs text-[var(--accent)] hover:underline">
                Mark all read
              </button>
            </Show>
          </div>

          <Show when={notifications().length === 0}>
            <div class="p-6 text-center text-[var(--text-muted)] text-sm">No notifications yet</div>
          </Show>

          <For each={notifications()}>
            {(notif) => (
              <div
                class={`p-3 border-b border-[var(--border)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors ${
                  notif.read ? 'opacity-60' : ''
                }`}
                onClick={() => {
                  markNotificationRead(notif.id)
                  if (notif.communityId) {
                    if (store.showDMView()) store.setShowDMView(false)
                    store.setActiveCommunityId(notif.communityId)
                  }
                  if (notif.channelId) store.setActiveChannelId(notif.channelId)
                  if (notif.messageId) store.setScrollToMessageId(notif.messageId)
                  setOpen(false)
                }}
              >
                <div class="flex items-start gap-2">
                  <Show when={!notif.read}>
                    <span class="w-2 h-2 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
                  </Show>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium truncate">{notif.title}</div>
                    <div class="text-xs text-[var(--text-muted)] truncate">{notif.body}</div>
                    <div class="text-[10px] text-[var(--text-muted)] mt-1">
                      {new Date(notif.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

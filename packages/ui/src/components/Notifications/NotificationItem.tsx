import { type JSX } from 'solid-js'
import type { PushNotification } from '@harmony/mobile'

export interface NotificationItemProps {
  notification: PushNotification
  onClick: () => void
}

export function useNotificationItem(props: NotificationItemProps) {
  const typeIcon = () => {
    switch (props.notification.data.type) {
      case 'message':
        return '💬'
      case 'dm':
        return '✉️'
      case 'mention':
        return '@'
      case 'reaction':
        return '❤️'
      case 'invite':
        return '📨'
      case 'voice':
        return '🔊'
      default:
        return '🔔'
    }
  }

  return {
    title: () => props.notification.title,
    body: () => props.notification.body,
    typeIcon,
    type: () => props.notification.data.type,
    time: () => {
      try {
        return new Date(props.notification.receivedAt).toLocaleTimeString()
      } catch {
        return ''
      }
    },
    click: () => props.onClick()
  }
}

export function NotificationItem(props: NotificationItemProps): JSX.Element {
  const ctrl = useNotificationItem(props)

  return (
    <div
      class="flex items-start gap-3 px-4 py-3 hover:bg-hm-bg-dark cursor-pointer transition-colors"
      onClick={() => ctrl.click()}
    >
      <span class="text-lg mt-0.5">{ctrl.typeIcon()}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-hm-text">{ctrl.title()}</p>
        <p class="text-xs text-hm-text-muted mt-0.5 truncate">{ctrl.body()}</p>
      </div>
      <span class="text-xs text-hm-text-muted whitespace-nowrap">{ctrl.time()}</span>
    </div>
  )
}

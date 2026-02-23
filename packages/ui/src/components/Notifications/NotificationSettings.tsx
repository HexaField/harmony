import { For, type JSX } from 'solid-js'

export interface NotificationConfig {
  channelId: string
  channelName: string
  enabled: boolean
  mentions: boolean
  muted: boolean
}

export interface NotificationSettingsProps {
  channels: NotificationConfig[]
  pushEnabled: boolean
  onTogglePush: (enabled: boolean) => void
  onUpdateChannel: (channelId: string, config: Partial<NotificationConfig>) => void
}

export function useNotificationSettings(props: NotificationSettingsProps) {
  return {
    channels: () => props.channels,
    pushEnabled: () => props.pushEnabled,
    togglePush: (enabled: boolean) => props.onTogglePush(enabled),
    updateChannel: (channelId: string, config: Partial<NotificationConfig>) => props.onUpdateChannel(channelId, config),
    enabledCount: () => props.channels.filter((c) => c.enabled).length,
    mutedCount: () => props.channels.filter((c) => c.muted).length
  }
}

export function NotificationSettings(props: NotificationSettingsProps): JSX.Element {
  const ctrl = useNotificationSettings(props)

  return (
    <div class="space-y-4 p-4">
      <h3 class="text-sm font-semibold text-white">Notification Settings</h3>

      <div class="bg-hm-bg-dark rounded-lg p-3">
        <label class="flex items-center justify-between cursor-pointer">
          <div>
            <p class="text-sm text-hm-text">Push Notifications</p>
            <p class="text-xs text-hm-text-muted">Receive notifications on your device</p>
          </div>
          <input
            type="checkbox"
            class="rounded"
            checked={ctrl.pushEnabled()}
            onChange={(e) => ctrl.togglePush(e.currentTarget.checked)}
          />
        </label>
      </div>

      <div>
        <p class="text-xs font-medium text-hm-text-muted uppercase tracking-wider mb-2">Per-Channel</p>
        <div class="space-y-1">
          <For each={ctrl.channels()}>
            {(channel) => (
              <div class="flex items-center justify-between bg-hm-bg-dark rounded-lg px-3 py-2">
                <span class="text-sm text-hm-text">#{channel.channelName}</span>
                <div class="flex items-center gap-3">
                  <label class="flex items-center gap-1 text-xs text-hm-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channel.enabled}
                      onChange={(e) => ctrl.updateChannel(channel.channelId, { enabled: e.currentTarget.checked })}
                    />
                    All
                  </label>
                  <label class="flex items-center gap-1 text-xs text-hm-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channel.mentions}
                      onChange={(e) => ctrl.updateChannel(channel.channelId, { mentions: e.currentTarget.checked })}
                    />
                    @mentions
                  </label>
                  <label class="flex items-center gap-1 text-xs text-hm-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channel.muted}
                      onChange={(e) => ctrl.updateChannel(channel.channelId, { muted: e.currentTarget.checked })}
                    />
                    Mute
                  </label>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}

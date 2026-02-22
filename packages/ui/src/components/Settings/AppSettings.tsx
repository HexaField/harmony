import { createSignal, type JSX } from 'solid-js'

export interface AppSettingsProps {
  onClose: () => void
  onSave: (settings: { theme: string; notifications: boolean; presenceDefault: string }) => void
  currentSettings?: {
    theme: string
    notifications: boolean
    presenceDefault: string
  }
}

export function AppSettings(props: AppSettingsProps): JSX.Element {
  const defaults = props.currentSettings ?? { theme: 'dark', notifications: true, presenceDefault: 'online' }
  const [theme, setTheme] = createSignal(defaults.theme)
  const [notifications, setNotifications] = createSignal(defaults.notifications)
  const [presenceDefault, setPresenceDefault] = createSignal(defaults.presenceDefault)

  return (
    <div class="p-6 max-w-lg mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-white">App Settings</h2>
        <button class="text-hm-text-muted hover:text-white" onClick={() => props.onClose()}>
          ✕
        </button>
      </div>

      <div class="space-y-6">
        {/* Theme */}
        <div>
          <label class="block text-sm font-medium text-hm-text mb-2">Theme</label>
          <select
            class="w-full bg-hm-bg-dark text-hm-text rounded-md px-3 py-2 text-sm border border-hm-bg-darker focus:border-hm-accent focus:outline-none"
            value={theme()}
            onChange={(e) => setTheme(e.currentTarget.value)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="amoled">AMOLED</option>
          </select>
        </div>

        {/* Notifications */}
        <div class="flex items-center justify-between">
          <div>
            <label class="text-sm font-medium text-hm-text">Notifications</label>
            <p class="text-xs text-hm-text-muted">Enable desktop notifications</p>
          </div>
          <button
            class={`w-12 h-6 rounded-full transition-colors ${notifications() ? 'bg-hm-green' : 'bg-hm-bg-darker'}`}
            onClick={() => setNotifications(!notifications())}
          >
            <div
              class={`w-5 h-5 rounded-full bg-white transition-transform ${notifications() ? 'translate-x-6' : 'translate-x-0.5'}`}
            />
          </button>
        </div>

        {/* Presence */}
        <div>
          <label class="block text-sm font-medium text-hm-text mb-2">Default Presence</label>
          <select
            class="w-full bg-hm-bg-dark text-hm-text rounded-md px-3 py-2 text-sm border border-hm-bg-darker focus:border-hm-accent focus:outline-none"
            value={presenceDefault()}
            onChange={(e) => setPresenceDefault(e.currentTarget.value)}
          >
            <option value="online">Online</option>
            <option value="idle">Idle</option>
            <option value="dnd">Do Not Disturb</option>
            <option value="offline">Invisible</option>
          </select>
        </div>

        <button
          class="w-full py-2.5 bg-hm-accent hover:bg-hm-accent-hover text-white rounded-md font-medium transition-colors"
          onClick={() =>
            props.onSave({ theme: theme(), notifications: notifications(), presenceDefault: presenceDefault() })
          }
        >
          Save Settings
        </button>
      </div>
    </div>
  )
}

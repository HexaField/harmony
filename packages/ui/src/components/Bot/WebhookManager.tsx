import { createSignal, For, Show, type JSX } from 'solid-js'

export interface WebhookConfig {
  id: string
  channelId: string
  channelName?: string
  url: string
  events: string[]
  active: boolean
  displayName: string
}

export interface WebhookManagerProps {
  webhooks: WebhookConfig[]
  channels: { id: string; name: string }[]
  onCreate: (config: { channelId: string; url: string; displayName: string; events: string[] }) => void
  onDelete: (webhookId: string) => void
  onToggle: (webhookId: string, active: boolean) => void
}

export function useWebhookManager(props: WebhookManagerProps) {
  const [showCreate, setShowCreate] = createSignal(false)
  const [newUrl, setNewUrl] = createSignal('')
  const [newName, setNewName] = createSignal('')
  const [newChannel, setNewChannel] = createSignal('')

  const create = () => {
    if (!newUrl().trim() || !newName().trim() || !newChannel()) return
    props.onCreate({
      channelId: newChannel(),
      url: newUrl().trim(),
      displayName: newName().trim(),
      events: ['message.created']
    })
    setNewUrl('')
    setNewName('')
    setNewChannel('')
    setShowCreate(false)
  }

  return {
    webhooks: () => props.webhooks,
    webhookCount: () => props.webhooks.length,
    channels: () => props.channels,
    showCreate,
    toggleCreate: () => setShowCreate((v) => !v),
    newUrl,
    setNewUrl,
    newName,
    setNewName,
    newChannel,
    setNewChannel,
    create,
    deleteWebhook: (id: string) => props.onDelete(id),
    toggleWebhook: (id: string, active: boolean) => props.onToggle(id, active),
    canCreate: () => newUrl().trim().length > 0 && newName().trim().length > 0 && newChannel().length > 0
  }
}

export function WebhookManager(props: WebhookManagerProps): JSX.Element {
  const ctrl = useWebhookManager(props)

  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-white">Webhooks</h3>
        <button
          class="px-3 py-1 text-xs font-medium text-white bg-hm-accent rounded hover:bg-hm-accent/80 transition-colors"
          onClick={() => ctrl.toggleCreate()}
        >
          {ctrl.showCreate() ? 'Cancel' : '+ New'}
        </button>
      </div>

      <Show when={ctrl.showCreate()}>
        <div class="bg-hm-bg-dark rounded-lg p-3 space-y-2">
          <input
            class="w-full bg-hm-bg-darker text-sm text-hm-text rounded px-3 py-2 outline-none placeholder-hm-text-muted"
            placeholder="Webhook name"
            value={ctrl.newName()}
            onInput={(e) => ctrl.setNewName(e.currentTarget.value)}
          />
          <input
            class="w-full bg-hm-bg-darker text-sm text-hm-text rounded px-3 py-2 outline-none placeholder-hm-text-muted"
            placeholder="https://example.com/webhook"
            value={ctrl.newUrl()}
            onInput={(e) => ctrl.setNewUrl(e.currentTarget.value)}
          />
          <select
            class="w-full bg-hm-bg-darker text-sm text-hm-text rounded px-3 py-2 outline-none"
            value={ctrl.newChannel()}
            onChange={(e) => ctrl.setNewChannel(e.currentTarget.value)}
          >
            <option value="">Select channel</option>
            <For each={ctrl.channels()}>{(ch) => <option value={ch.id}>#{ch.name}</option>}</For>
          </select>
          <button
            class="w-full px-4 py-2 text-sm font-medium text-white bg-hm-accent rounded disabled:opacity-50"
            disabled={!ctrl.canCreate()}
            onClick={() => ctrl.create()}
          >
            Create Webhook
          </button>
        </div>
      </Show>

      <div class="divide-y divide-hm-bg-darker">
        <For each={ctrl.webhooks()}>
          {(webhook) => (
            <div class="flex items-center gap-3 py-3">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-hm-text">{webhook.displayName}</p>
                <p class="text-xs text-hm-text-muted truncate">{webhook.url}</p>
              </div>
              <button
                class={`text-xs px-2 py-1 rounded ${webhook.active ? "bg-green-600/20 text-green-400" : "bg-hm-bg-dark text-hm-text-muted"}`}
                onClick={() => ctrl.toggleWebhook(webhook.id, !webhook.active)}
              >
                {webhook.active ? 'Active' : 'Disabled'}
              </button>
              <button class="text-xs text-red-400 hover:text-red-300" onClick={() => ctrl.deleteWebhook(webhook.id)}>
                Delete
              </button>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

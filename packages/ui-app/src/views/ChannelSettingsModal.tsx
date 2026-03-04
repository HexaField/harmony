import { createSignal, For, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const ChannelSettingsModal: Component = () => {
  const store = useAppStore()
  const channelId = () => store.showChannelSettings()
  const channel = () => store.channels().find((c) => c.id === channelId())

  const [name, setName] = createSignal('')
  const [topic, setTopic] = createSignal('')
  const [deleteConfirm, setDeleteConfirm] = createSignal(false)

  // Initialize form when channel changes
  const init = () => {
    const ch = channel()
    if (ch) {
      setName(ch.name)
      setTopic(ch.topic ?? '')
    }
  }

  // Call init on render
  init()

  const close = () => store.setShowChannelSettings(null)

  const save = async () => {
    const client = store.client()
    const communityId = store.activeCommunityId()
    const chId = channelId()
    if (!client || !communityId || !chId) return

    await client.updateChannel(communityId, chId, {
      communityId,
      name: name(),
      type: (channel()?.type === 'thread' ? 'text' : (channel()?.type ?? 'text')) as 'text' | 'voice' | 'announcement',
      topic: topic() || undefined
    })

    // Update local state
    store.setChannels(
      store.channels().map((c) => (c.id === chId ? { ...c, name: name(), topic: topic() || undefined } : c))
    )
    close()
  }

  const doDelete = async () => {
    const client = store.client()
    const communityId = store.activeCommunityId()
    const chId = channelId()
    if (!client || !communityId || !chId) return

    await client.deleteChannel(communityId, chId)
    store.setChannels(store.channels().filter((c) => c.id !== chId))
    if (store.activeChannelId() === chId) {
      const remaining = store.channels().filter((c) => c.id !== chId)
      store.setActiveChannelId(remaining[0]?.id ?? '')
    }
    close()
  }

  const getPermsForRole = (roleId: string) => {
    const chId = channelId()
    if (!chId) return { read: true, send: true, manage: false }
    const perms = store.channelPermissions().get(chId)?.get(roleId)
    return perms ?? { read: true, send: true, manage: false }
  }

  const togglePerm = (roleId: string, perm: 'read' | 'send' | 'manage') => {
    const chId = channelId()
    if (!chId) return
    const current = getPermsForRole(roleId)
    store.setChannelPermission(chId, roleId, { ...current, [perm]: !current[perm] })
  }

  return (
    <Show when={channelId()}>
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={close}>
        <div
          class="bg-[var(--bg-secondary)] rounded-lg w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">{t('CHANNEL_SETTINGS_TITLE')}</h2>
            <button class="text-[var(--text-muted)] hover:text-[var(--text-primary)]" onClick={close}>
              ✕
            </button>
          </div>

          <div class="space-y-4">
            {/* Channel name */}
            <div>
              <label class="text-xs text-[var(--text-muted)] mb-1 block">{t('CHANNEL_SETTINGS_NAME')}</label>
              <input
                class="w-full bg-[var(--bg-input)] text-sm rounded px-3 py-2 outline-none"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </div>

            {/* Topic */}
            <div>
              <label class="text-xs text-[var(--text-muted)] mb-1 block">{t('CHANNEL_SETTINGS_TOPIC')}</label>
              <input
                class="w-full bg-[var(--bg-input)] text-sm rounded px-3 py-2 outline-none"
                placeholder={t('CHANNEL_SETTINGS_TOPIC_PLACEHOLDER')}
                value={topic()}
                onInput={(e) => setTopic(e.currentTarget.value)}
              />
            </div>

            {/* Permission overrides */}
            <div>
              <label class="text-xs text-[var(--text-muted)] mb-2 block">{t('CHANNEL_SETTINGS_PERMISSIONS')}</label>
              <Show
                when={store.roles().length > 0}
                fallback={<p class="text-sm text-[var(--text-muted)]">{t('CHANNEL_SETTINGS_NO_ROLES')}</p>}
              >
                <div class="space-y-2">
                  {/* Header */}
                  <div class="flex items-center text-xs text-[var(--text-muted)] px-2">
                    <span class="flex-1">{t('ROLE_NAME')}</span>
                    <span class="w-16 text-center">{t('CHANNEL_SETTINGS_PERM_READ')}</span>
                    <span class="w-16 text-center">{t('CHANNEL_SETTINGS_PERM_SEND')}</span>
                    <span class="w-16 text-center">{t('CHANNEL_SETTINGS_PERM_MANAGE')}</span>
                  </div>
                  <For each={store.roles()}>
                    {(role) => {
                      const perms = () => getPermsForRole(role.id)
                      return (
                        <div class="flex items-center bg-[var(--bg-input)] rounded px-2 py-1.5">
                          <div class="flex items-center gap-2 flex-1">
                            <div class="w-3 h-3 rounded-full" style={{ 'background-color': role.color ?? '#888' }} />
                            <span class="text-sm">{role.name}</span>
                          </div>
                          <div class="w-16 flex justify-center">
                            <input
                              type="checkbox"
                              checked={perms().read}
                              onChange={() => togglePerm(role.id, 'read')}
                              class="accent-[var(--accent)]"
                            />
                          </div>
                          <div class="w-16 flex justify-center">
                            <input
                              type="checkbox"
                              checked={perms().send}
                              onChange={() => togglePerm(role.id, 'send')}
                              class="accent-[var(--accent)]"
                            />
                          </div>
                          <div class="w-16 flex justify-center">
                            <input
                              type="checkbox"
                              checked={perms().manage}
                              onChange={() => togglePerm(role.id, 'manage')}
                              class="accent-[var(--accent)]"
                            />
                          </div>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </Show>
            </div>

            {/* Actions */}
            <div class="flex justify-between pt-2">
              <button
                class="px-4 py-2 text-sm rounded bg-[var(--error)] text-white hover:opacity-90"
                onClick={() => setDeleteConfirm(true)}
              >
                {t('CHANNEL_SETTINGS_DELETE')}
              </button>
              <div class="flex gap-2">
                <button
                  class="px-4 py-2 text-sm rounded bg-[var(--bg-input)] hover:bg-[var(--bg-primary)]"
                  onClick={close}
                >
                  {t('CHANNEL_SETTINGS_DELETE_NO')}
                </button>
                <button class="px-4 py-2 text-sm rounded bg-[var(--accent)] text-white hover:opacity-90" onClick={save}>
                  {t('CHANNEL_SETTINGS_SAVE')}
                </button>
              </div>
            </div>
          </div>

          {/* Delete confirmation */}
          <Show when={deleteConfirm()}>
            <div
              class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
              onClick={() => setDeleteConfirm(false)}
            >
              <div class="bg-[var(--bg-secondary)] rounded-lg p-6 max-w-sm" onClick={(e) => e.stopPropagation()}>
                <p class="text-sm mb-4">{t('CHANNEL_SETTINGS_DELETE_CONFIRM', { name: channel()?.name ?? '' })}</p>
                <div class="flex gap-2 justify-end">
                  <button
                    class="px-4 py-2 text-sm rounded bg-[var(--bg-input)]"
                    onClick={() => setDeleteConfirm(false)}
                  >
                    {t('CHANNEL_SETTINGS_DELETE_NO')}
                  </button>
                  <button class="px-4 py-2 text-sm rounded bg-[var(--error)] text-white" onClick={doDelete}>
                    {t('CHANNEL_SETTINGS_DELETE_YES')}
                  </button>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  )
}

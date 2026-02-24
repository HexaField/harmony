import { createSignal, For, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import type { DelegationInfo } from '../types.js'
import { pseudonymFromDid } from '../utils/pseudonym.js'

const EXPIRY_OPTIONS = [
  { key: 'none', label: () => t('DELEGATION_EXPIRY_NONE'), ms: 0 },
  { key: '1h', label: () => t('DELEGATION_EXPIRY_1H'), ms: 3600000 },
  { key: '24h', label: () => t('DELEGATION_EXPIRY_24H'), ms: 86400000 },
  { key: '7d', label: () => t('DELEGATION_EXPIRY_7D'), ms: 604800000 }
]

const DELEGATABLE_PERMISSIONS = [
  { key: 'send_messages', label: () => t('ROLE_PERM_SEND_MESSAGES') },
  { key: 'manage_channels', label: () => t('ROLE_PERM_MANAGE_CHANNELS') },
  { key: 'manage_roles', label: () => t('ROLE_PERM_MANAGE_ROLES') },
  { key: 'kick_members', label: () => t('ROLE_PERM_KICK_MEMBERS') },
  { key: 'ban_members', label: () => t('ROLE_PERM_BAN_MEMBERS') },
  { key: 'manage_community', label: () => t('ROLE_PERM_MANAGE_COMMUNITY') }
]

export const DelegationView: Component = () => {
  const store = useAppStore()
  const [creating, setCreating] = createSignal(false)
  const [selectedMember, setSelectedMember] = createSignal('')
  const [selectedPerms, setSelectedPerms] = createSignal<string[]>([])
  const [expiry, setExpiry] = createSignal('none')
  const [channelScope, setChannelScope] = createSignal('')

  const close = () => store.setShowDelegationView(false)

  const togglePerm = (key: string) => {
    setSelectedPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]))
  }

  const startCreate = () => {
    setCreating(true)
    setSelectedMember('')
    setSelectedPerms([])
    setExpiry('none')
    setChannelScope('')
  }

  const cancel = () => setCreating(false)

  const save = async () => {
    const client = store.client()
    if (!client || !selectedMember() || selectedPerms().length === 0) return

    try {
      const result = await client.delegateTo(selectedMember(), selectedPerms())
      const expiryOption = EXPIRY_OPTIONS.find((o) => o.key === expiry())
      const delegation: DelegationInfo = {
        id: result.id,
        fromDID: store.did(),
        toDID: selectedMember(),
        capabilities: selectedPerms(),
        createdAt: result.createdAt,
        expiresAt:
          expiryOption && expiryOption.ms > 0 ? new Date(Date.now() + expiryOption.ms).toISOString() : undefined,
        channelScope: channelScope() || undefined,
        active: true
      }
      store.addDelegation(delegation)
      setCreating(false)
    } catch {
      // delegation failed
    }
  }

  const revoke = (id: string) => {
    store.removeDelegation(id)
  }

  const otherMembers = () => store.members().filter((m) => m.did !== store.did())
  const activeChannels = () => store.channels().filter((c) => c.communityId === store.activeCommunityId())

  return (
    <Show when={store.showDelegationView()}>
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={close}>
        <div
          class="bg-[var(--bg-secondary)] rounded-lg w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">{t('DELEGATION_TITLE')}</h2>
            <button class="text-[var(--text-muted)] hover:text-[var(--text-primary)]" onClick={close}>
              ✕
            </button>
          </div>

          <Show when={!creating()}>
            <button
              class="mb-4 px-4 py-2 bg-[var(--accent)] rounded text-white text-sm hover:opacity-90"
              onClick={startCreate}
            >
              + {t('DELEGATION_CREATE')}
            </button>

            <Show when={store.delegations().length === 0}>
              <p class="text-[var(--text-muted)] text-sm">{t('DELEGATION_EMPTY')}</p>
            </Show>

            <div class="space-y-2">
              <For each={store.delegations()}>
                {(delegation) => (
                  <div class="bg-[var(--bg-input)] rounded px-3 py-2">
                    <div class="flex items-center justify-between">
                      <div class="text-sm">
                        <span class="text-[var(--text-muted)]">{t('DELEGATION_FROM')}: </span>
                        <span>{pseudonymFromDid(delegation.fromDID)}</span>
                        <span class="text-[var(--text-muted)]"> → {t('DELEGATION_TO')}: </span>
                        <span>{pseudonymFromDid(delegation.toDID)}</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span
                          class={`text-xs px-2 py-0.5 rounded ${delegation.active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
                        >
                          {delegation.active ? t('DELEGATION_ACTIVE') : t('DELEGATION_EXPIRED')}
                        </span>
                        <button
                          class="text-xs text-[var(--error)] hover:underline"
                          onClick={() => revoke(delegation.id)}
                        >
                          {t('DELEGATION_REVOKE')}
                        </button>
                      </div>
                    </div>
                    <div class="text-xs text-[var(--text-muted)] mt-1">
                      {delegation.capabilities.join(', ')}
                      <Show when={delegation.expiresAt}>
                        {' · '}
                        {t('DELEGATION_EXPIRES', { time: new Date(delegation.expiresAt!).toLocaleString() })}
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Create form */}
          <Show when={creating()}>
            <div class="space-y-4">
              {/* Member select */}
              <div>
                <label class="text-xs text-[var(--text-muted)] mb-1 block">{t('DELEGATION_MEMBER')}</label>
                <select
                  class="w-full bg-[var(--bg-input)] text-sm rounded px-3 py-2 outline-none"
                  value={selectedMember()}
                  onChange={(e) => setSelectedMember(e.currentTarget.value)}
                >
                  <option value="">{t('DELEGATION_MEMBER_PLACEHOLDER')}</option>
                  <For each={otherMembers()}>
                    {(member) => (
                      <option value={member.did}>{member.displayName || pseudonymFromDid(member.did)}</option>
                    )}
                  </For>
                </select>
              </div>

              {/* Permissions */}
              <div>
                <label class="text-xs text-[var(--text-muted)] mb-1 block">{t('DELEGATION_PERMISSIONS')}</label>
                <div class="space-y-1">
                  <For each={DELEGATABLE_PERMISSIONS}>
                    {(perm) => (
                      <label class="flex items-center gap-2 text-sm cursor-pointer hover:bg-[var(--bg-input)] px-2 py-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedPerms().includes(perm.key)}
                          onChange={() => togglePerm(perm.key)}
                          class="accent-[var(--accent)]"
                        />
                        {perm.label()}
                      </label>
                    )}
                  </For>
                </div>
              </div>

              {/* Expiry */}
              <div>
                <label class="text-xs text-[var(--text-muted)] mb-1 block">{t('DELEGATION_EXPIRY')}</label>
                <select
                  class="w-full bg-[var(--bg-input)] text-sm rounded px-3 py-2 outline-none"
                  value={expiry()}
                  onChange={(e) => setExpiry(e.currentTarget.value)}
                >
                  <For each={EXPIRY_OPTIONS}>{(opt) => <option value={opt.key}>{opt.label()}</option>}</For>
                </select>
              </div>

              {/* Channel scope */}
              <div>
                <label class="text-xs text-[var(--text-muted)] mb-1 block">{t('DELEGATION_CHANNEL_SCOPE')}</label>
                <select
                  class="w-full bg-[var(--bg-input)] text-sm rounded px-3 py-2 outline-none"
                  value={channelScope()}
                  onChange={(e) => setChannelScope(e.currentTarget.value)}
                >
                  <option value="">{t('DELEGATION_CHANNEL_ALL')}</option>
                  <For each={activeChannels()}>{(ch) => <option value={ch.id}>#{ch.name}</option>}</For>
                </select>
              </div>

              {/* Actions */}
              <div class="flex gap-2 justify-end">
                <button
                  class="px-4 py-2 text-sm rounded bg-[var(--bg-input)] hover:bg-[var(--bg-primary)]"
                  onClick={cancel}
                >
                  {t('DELEGATION_CANCEL')}
                </button>
                <button
                  class="px-4 py-2 text-sm rounded bg-[var(--accent)] text-white hover:opacity-90"
                  onClick={save}
                  disabled={!selectedMember() || selectedPerms().length === 0}
                >
                  {t('DELEGATION_SAVE')}
                </button>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  )
}

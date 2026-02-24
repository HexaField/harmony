import { createSignal, For, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import type { RoleInfo } from '../types.js'

const PRESET_COLORS = [
  '#5865F2',
  '#57F287',
  '#FEE75C',
  '#EB459E',
  '#ED4245',
  '#FF7F50',
  '#1ABC9C',
  '#E91E63',
  '#9B59B6',
  '#3498DB'
]

const ALL_PERMISSIONS = [
  { key: 'send_messages', label: () => t('ROLE_PERM_SEND_MESSAGES') },
  { key: 'manage_channels', label: () => t('ROLE_PERM_MANAGE_CHANNELS') },
  { key: 'manage_roles', label: () => t('ROLE_PERM_MANAGE_ROLES') },
  { key: 'kick_members', label: () => t('ROLE_PERM_KICK_MEMBERS') },
  { key: 'ban_members', label: () => t('ROLE_PERM_BAN_MEMBERS') },
  { key: 'manage_community', label: () => t('ROLE_PERM_MANAGE_COMMUNITY') }
]

export const RoleManagerView: Component = () => {
  const store = useAppStore()
  const [editing, setEditing] = createSignal<RoleInfo | null>(null)
  const [creating, setCreating] = createSignal(false)
  const [name, setName] = createSignal('')
  const [color, setColor] = createSignal(PRESET_COLORS[0])
  const [permissions, setPermissions] = createSignal<string[]>([])
  const [deleteConfirm, setDeleteConfirm] = createSignal<string | null>(null)

  const canManageRoles = () => {
    const myDid = store.did()
    const me = store.members().find((m) => m.did === myDid)
    if (!me) return false
    // Check if user has manage_roles permission via any role, or is community creator (has admin role)
    if (me.roles.includes('admin')) return true
    const myRoles = store.roles().filter((r) => me.roles.includes(r.id))
    return myRoles.some((r) => r.permissions.includes('manage_roles'))
  }

  const startCreate = () => {
    setCreating(true)
    setEditing(null)
    setName('')
    setColor(PRESET_COLORS[0])
    setPermissions([])
  }

  const startEdit = (role: RoleInfo) => {
    setEditing(role)
    setCreating(false)
    setName(role.name)
    setColor(role.color ?? PRESET_COLORS[0])
    setPermissions([...role.permissions])
  }

  const cancel = () => {
    setEditing(null)
    setCreating(false)
  }

  const togglePerm = (key: string) => {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]))
  }

  const save = async () => {
    const client = store.client()
    const communityId = store.activeCommunityId()
    if (!client || !communityId) return

    if (creating()) {
      const id = crypto.randomUUID()
      const position = store.roles().length
      await client.createRole(communityId, {
        communityId,
        name: name(),
        color: color(),
        permissions: permissions(),
        position
      })
      store.addRole({ id, name: name(), color: color(), permissions: permissions(), position })
    } else {
      const role = editing()
      if (!role) return
      await client.updateRole(communityId, role.id, {
        communityId,
        name: name(),
        color: color(),
        permissions: permissions()
      })
      store.updateRole(role.id, { name: name(), color: color(), permissions: permissions() })
    }
    cancel()
  }

  const confirmDelete = (roleId: string) => {
    setDeleteConfirm(roleId)
  }

  const doDelete = async () => {
    const id = deleteConfirm()
    if (!id) return
    const client = store.client()
    const communityId = store.activeCommunityId()
    if (client && communityId) {
      await client.deleteRole(communityId, id)
      store.removeRole(id)
    }
    setDeleteConfirm(null)
  }

  const moveRole = async (roleId: string, direction: -1 | 1) => {
    const sorted = store.roles()
    const idx = sorted.findIndex((r) => r.id === roleId)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const updated = [...sorted]
    const posA = updated[idx].position
    const posB = updated[swapIdx].position
    updated[idx] = { ...updated[idx], position: posB }
    updated[swapIdx] = { ...updated[swapIdx], position: posA }
    store.setRoles(updated)

    const client = store.client()
    const communityId = store.activeCommunityId()
    if (client && communityId) {
      await client.updateRole(communityId, updated[idx].id, { communityId, position: posB })
      await client.updateRole(communityId, updated[swapIdx].id, { communityId, position: posA })
    }
  }

  return (
    <Show when={store.showRoleManager()}>
      <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={() => store.setShowRoleManager(false)}
      >
        <div
          class="bg-[var(--bg-secondary)] rounded-lg w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">{t('ROLE_MANAGER_TITLE')}</h2>
            <div class="flex items-center gap-2">
              <button
                class="text-xs text-[var(--accent)] hover:underline"
                onClick={() => {
                  store.setShowRoleManager(false)
                  store.setShowDelegationView(true)
                }}
              >
                {t('DELEGATION_TITLE')}
              </button>
              <button
                class="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                onClick={() => store.setShowRoleManager(false)}
              >
                ✕
              </button>
            </div>
          </div>

          <Show when={canManageRoles()} fallback={<p class="text-[var(--text-muted)]">{t('ROLE_NO_ROLES')}</p>}>
            {/* Role list */}
            <Show when={!creating() && !editing()}>
              <button
                class="mb-4 px-4 py-2 bg-[var(--accent)] rounded text-white text-sm hover:opacity-90"
                onClick={startCreate}
              >
                + {t('ROLE_CREATE')}
              </button>
              <Show when={store.roles().length === 0}>
                <p class="text-[var(--text-muted)] text-sm">{t('ROLE_NO_ROLES')}</p>
              </Show>
              <div class="space-y-2">
                <For each={store.roles()}>
                  {(role, idx) => (
                    <div class="flex items-center justify-between bg-[var(--bg-input)] rounded px-3 py-2">
                      <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full" style={{ 'background-color': role.color ?? '#888' }} />
                        <span class="text-sm">{role.name}</span>
                      </div>
                      <div class="flex items-center gap-1">
                        <button
                          class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1 disabled:opacity-30"
                          disabled={idx() === 0}
                          onClick={() => moveRole(role.id, -1)}
                          title={t('ROLE_MOVE_UP')}
                        >
                          ▲
                        </button>
                        <button
                          class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1 disabled:opacity-30"
                          disabled={idx() === store.roles().length - 1}
                          onClick={() => moveRole(role.id, 1)}
                          title={t('ROLE_MOVE_DOWN')}
                        >
                          ▼
                        </button>
                        <button
                          class="text-xs text-[var(--accent)] hover:underline px-1"
                          onClick={() => startEdit(role)}
                        >
                          {t('ROLE_EDIT')}
                        </button>
                        <button
                          class="text-xs text-[var(--error)] hover:underline px-1"
                          onClick={() => confirmDelete(role.id)}
                        >
                          {t('ROLE_DELETE')}
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Create / Edit form */}
            <Show when={creating() || editing()}>
              <div class="space-y-4">
                <div>
                  <label class="text-xs text-[var(--text-muted)] mb-1 block">{t('ROLE_NAME')}</label>
                  <input
                    class="w-full bg-[var(--bg-input)] text-sm rounded px-3 py-2 outline-none"
                    placeholder={t('ROLE_NAME_PLACEHOLDER')}
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                  />
                </div>
                <div>
                  <label class="text-xs text-[var(--text-muted)] mb-1 block">{t('ROLE_COLOR')}</label>
                  <div class="flex gap-2 flex-wrap">
                    <For each={PRESET_COLORS}>
                      {(c) => (
                        <button
                          class="w-6 h-6 rounded-full border-2 transition-all"
                          classList={{ 'border-white scale-110': color() === c, 'border-transparent': color() !== c }}
                          style={{ 'background-color': c }}
                          onClick={() => setColor(c)}
                        />
                      )}
                    </For>
                  </div>
                </div>
                <div>
                  <label class="text-xs text-[var(--text-muted)] mb-1 block">{t('ROLE_PERMISSIONS')}</label>
                  <div class="space-y-1">
                    <For each={ALL_PERMISSIONS}>
                      {(perm) => (
                        <label class="flex items-center gap-2 text-sm cursor-pointer hover:bg-[var(--bg-input)] px-2 py-1 rounded">
                          <input
                            type="checkbox"
                            checked={permissions().includes(perm.key)}
                            onChange={() => togglePerm(perm.key)}
                            class="accent-[var(--accent)]"
                          />
                          {perm.label()}
                        </label>
                      )}
                    </For>
                  </div>
                </div>
                <div class="flex gap-2 justify-end">
                  <button
                    class="px-4 py-2 text-sm rounded bg-[var(--bg-input)] hover:bg-[var(--bg-primary)]"
                    onClick={cancel}
                  >
                    {t('ROLE_CANCEL')}
                  </button>
                  <button
                    class="px-4 py-2 text-sm rounded bg-[var(--accent)] text-white hover:opacity-90"
                    onClick={save}
                  >
                    {t('ROLE_SAVE')}
                  </button>
                </div>
              </div>
            </Show>

            {/* Delete confirm */}
            <Show when={deleteConfirm()}>
              {(roleId) => {
                const role = store.roles().find((r) => r.id === roleId())
                return (
                  <div
                    class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
                    onClick={() => setDeleteConfirm(null)}
                  >
                    <div class="bg-[var(--bg-secondary)] rounded-lg p-6 max-w-sm" onClick={(e) => e.stopPropagation()}>
                      <p class="text-sm mb-4">{t('ROLE_DELETE_CONFIRM', { name: role?.name ?? '' })}</p>
                      <div class="flex gap-2 justify-end">
                        <button
                          class="px-4 py-2 text-sm rounded bg-[var(--bg-input)]"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          {t('ROLE_CANCEL')}
                        </button>
                        <button class="px-4 py-2 text-sm rounded bg-[var(--error)] text-white" onClick={doDelete}>
                          {t('ROLE_DELETE')}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }}
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  )
}

import { createSignal, For, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { MemberList } from '../components/Members/index.js'
import { t } from '../i18n/strings.js'
import { pseudonymFromDid, initialsFromName } from '../utils/pseudonym.js'

export const MemberSidebarView: Component = () => {
  const store = useAppStore()
  const [menuMember, setMenuMember] = createSignal<string | null>(null)
  const [menuPos, setMenuPos] = createSignal({ x: 0, y: 0 })

  const memberData = () =>
    MemberList({
      members: store.members(),
      onSelect: (_did: string) => {}
    })

  const canManageRoles = () => {
    const myDid = store.did()
    const me = store.members().find((m) => m.did === myDid)
    if (!me) return false
    if (me.roles.includes('admin')) return true
    const myRoles = store.roles().filter((r) => me.roles.includes(r.id))
    return myRoles.some((r) => r.permissions.includes('manage_roles'))
  }

  const openMenu = (did: string, e: MouseEvent) => {
    if (!canManageRoles()) return
    e.preventDefault()
    e.stopPropagation()
    setMenuMember(did)
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const closeMenu = () => setMenuMember(null)

  const toggleRole = async (memberDid: string, roleId: string) => {
    const client = store.client()
    const communityId = store.activeCommunityId()
    if (!client || !communityId) return
    const member = store.members().find((m) => m.did === memberDid)
    if (!member) return
    const hasRole = member.roles.includes(roleId)
    const newRoles = hasRole ? member.roles.filter((r) => r !== roleId) : [...member.roles, roleId]
    store.setMembers(store.members().map((m) => (m.did === memberDid ? { ...m, roles: newRoles } : m)))
    // Send each role assignment — assignRole sets roles array
    if (!hasRole) {
      await client.assignRole(communityId, memberDid, roleId)
    }
    closeMenu()
  }

  const getRoleColor = (roleName: string): string | undefined => {
    const role = store.roles().find((r) => r.id === roleName || r.name === roleName)
    return role?.color
  }

  const getRoleDisplayName = (roleName: string): string => {
    const role = store.roles().find((r) => r.id === roleName)
    return role?.name ?? roleName
  }

  const renderMember = (
    member: { did: string; displayName?: string; roles: string[]; status: string },
    isOnline: boolean
  ) => {
    const displayName = member.displayName ?? pseudonymFromDid(member.did)
    const initials = initialsFromName(displayName)
    return (
      <div
        class="flex items-center px-2 py-1.5 rounded hover:bg-[var(--bg-input)] cursor-pointer transition-colors group"
        classList={{ 'opacity-50': !isOnline }}
        onClick={(e) => openMenu(member.did, e)}
      >
        <div class="relative">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            classList={{
              'bg-[var(--accent)]': isOnline,
              'bg-[var(--bg-input)]': !isOnline
            }}
          >
            <span classList={{ 'text-[var(--text-muted)]': !isOnline }}>{initials}</span>
          </div>
          <Show when={isOnline}>
            <div
              class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--bg-secondary)]"
              classList={{
                'bg-[var(--success)]': member.status === 'online',
                'bg-[var(--warning)]': member.status === 'idle',
                'bg-[var(--error)]': member.status === 'dnd'
              }}
            />
          </Show>
          <Show when={!isOnline}>
            <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--bg-secondary)] bg-[var(--text-muted)]" />
          </Show>
        </div>
        <div class="ml-2 min-w-0">
          <div class="text-sm truncate" classList={{ 'text-[var(--text-muted)]': !isOnline }}>
            {displayName}
          </div>
          <div class="flex flex-wrap gap-0.5">
            <For each={member.roles}>
              {(role) => {
                const roleColor = getRoleColor(role)
                return (
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded-sm mr-0.5"
                    style={{
                      'background-color': roleColor ? `${roleColor}33` : 'var(--bg-input)',
                      color: roleColor ?? 'var(--text-muted)',
                      border: roleColor ? `1px solid ${roleColor}55` : 'none'
                    }}
                  >
                    {getRoleDisplayName(role)}
                  </span>
                )
              }}
            </For>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="w-[var(--member-bar-width)] bg-[var(--bg-secondary)] border-l border-[var(--border)] overflow-y-auto shrink-0">
      <div class="p-4">
        {/* Role manager button */}
        <Show when={canManageRoles()}>
          <button
            class="w-full mb-3 px-3 py-1.5 text-xs bg-[var(--bg-input)] rounded hover:bg-[var(--accent)] hover:text-white transition-colors flex items-center justify-center gap-1"
            onClick={() => store.setShowRoleManager(true)}
          >
            ⚙️ {t('ROLE_MANAGER_TITLE')}
          </button>
        </Show>

        {/* Online members */}
        <h3 class="text-xs font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-2">
          {memberData().onlineLabel} — {memberData().online.length}
        </h3>
        <For each={memberData().online}>{(member) => renderMember(member, true)}</For>

        {/* Offline members */}
        <h3 class="text-xs font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-2 mt-4">
          {memberData().offlineLabel} — {memberData().offline.length}
        </h3>
        <For each={memberData().offline}>{(member) => renderMember(member, false)}</For>

        {/* Unlinked members (imported from Discord, not yet migrated) */}
        <Show when={memberData().unlinked.length > 0}>
          <h3 class="text-xs font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-2 mt-4">
            {memberData().unlinkedLabel} — {memberData().unlinked.length}
          </h3>
          <For each={memberData().unlinked}>{(member) => renderMember(member, false)}</For>
        </Show>
      </div>

      {/* Role assignment context menu */}
      <Show when={menuMember()}>
        {(memberDid) => {
          const member = store.members().find((m) => m.did === memberDid())
          return (
            <div class="fixed inset-0 z-50" onClick={closeMenu}>
              <div
                class="absolute bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl p-3 min-w-[200px]"
                style={{ left: `${menuPos().x}px`, top: `${menuPos().y}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                <p class="text-xs text-[var(--text-muted)] mb-2">
                  {t('ROLE_MEMBER_MENU_TITLE', { name: member?.displayName ?? pseudonymFromDid(memberDid()) })}
                </p>
                <Show when={store.roles().length === 0}>
                  <p class="text-xs text-[var(--text-muted)]">{t('ROLE_NO_ROLES')}</p>
                </Show>
                <For each={store.roles()}>
                  {(role) => {
                    const hasRole = member?.roles.includes(role.id) ?? false
                    return (
                      <button
                        class="w-full text-left px-2 py-1 text-sm rounded hover:bg-[var(--bg-input)] flex items-center gap-2"
                        onClick={() => toggleRole(memberDid(), role.id)}
                      >
                        <div class="w-3 h-3 rounded-full" style={{ 'background-color': role.color ?? '#888' }} />
                        <span class="flex-1">{role.name}</span>
                        <Show when={hasRole}>
                          <span class="text-[var(--success)]">✓</span>
                        </Show>
                      </button>
                    )
                  }}
                </For>
              </div>
            </div>
          )
        }}
      </Show>
    </div>
  )
}

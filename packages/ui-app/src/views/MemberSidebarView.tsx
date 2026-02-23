import { For, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { MemberList } from '../components/Members/index.js'
import { t } from '../i18n/strings.js'

export const MemberSidebarView: Component = () => {
  const store = useAppStore()

  const memberData = () =>
    MemberList({
      members: store.members(),
      onSelect: (_did: string) => {}
    })

  return (
    <div class="w-[var(--member-bar-width)] bg-[var(--bg-secondary)] border-l border-[var(--border)] overflow-y-auto shrink-0">
      <div class="p-4">
        {/* Online members */}
        <h3 class="text-xs font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-2">
          {memberData().onlineLabel} — {memberData().online.length}
        </h3>
        <For each={memberData().online}>
          {(member) => {
            const initials = (member.displayName ?? member.did).substring(0, 2).toUpperCase()
            return (
              <div class="flex items-center px-2 py-1.5 rounded hover:bg-[var(--bg-input)] cursor-pointer transition-colors group">
                <div class="relative">
                  <div class="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-white">
                    {initials}
                  </div>
                  <div
                    class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--bg-secondary)]"
                    classList={{
                      'bg-[var(--success)]': member.status === 'online',
                      'bg-[var(--warning)]': member.status === 'idle',
                      'bg-[var(--error)]': member.status === 'dnd'
                    }}
                  />
                </div>
                <div class="ml-2 min-w-0">
                  <div class="text-sm truncate">{member.displayName ?? member.did.substring(0, 16)}</div>
                  <For each={member.roles}>
                    {(role) => (
                      <span class="text-[10px] text-[var(--text-muted)] bg-[var(--bg-input)] px-1.5 py-0.5 rounded-sm mr-1">
                        {role}
                      </span>
                    )}
                  </For>
                </div>
              </div>
            )
          }}
        </For>

        {/* Offline members */}
        <h3 class="text-xs font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-2 mt-4">
          {memberData().offlineLabel} — {memberData().offline.length}
        </h3>
        <For each={memberData().offline}>
          {(member) => {
            const initials = (member.displayName ?? member.did).substring(0, 2).toUpperCase()
            return (
              <div class="flex items-center px-2 py-1.5 rounded hover:bg-[var(--bg-input)] cursor-pointer transition-colors opacity-50">
                <div class="relative">
                  <div class="w-8 h-8 rounded-full bg-[var(--bg-input)] flex items-center justify-center text-xs font-bold text-[var(--text-muted)]">
                    {initials}
                  </div>
                  <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--bg-secondary)] bg-[var(--text-muted)]" />
                </div>
                <div class="ml-2 min-w-0">
                  <div class="text-sm truncate text-[var(--text-muted)]">
                    {member.displayName ?? member.did.substring(0, 16)}
                  </div>
                </div>
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}

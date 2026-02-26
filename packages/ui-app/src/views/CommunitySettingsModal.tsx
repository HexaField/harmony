import { createSignal, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'

export const CommunitySettingsModal: Component = () => {
  const store = useAppStore()
  const community = () => store.communities().find((c) => c.id === store.activeCommunityId())
  const [name, setName] = createSignal(community()?.name ?? '')
  const [description, setDescription] = createSignal(community()?.description ?? '')
  const [saving, setSaving] = createSignal(false)

  const handleSave = async () => {
    const client = store.client()
    const communityId = store.activeCommunityId()
    if (!client || !communityId) return
    setSaving(true)
    try {
      await client.updateCommunity(communityId, { name: name(), description: description() })
      store.setCommunities(
        store.communities().map((c) => (c.id === communityId ? { ...c, name: name(), description: description() } : c))
      )
      store.setShowCommunitySettings(false)
    } catch (err) {
      console.error('Failed to update community:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      onClick={() => store.setShowCommunitySettings(false)}
    >
      <div class="bg-[var(--bg-surface)] rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 class="text-lg font-semibold mb-4">Community Settings</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-[var(--text-muted)] mb-1">Community Name</label>
            <input
              class="w-full bg-[var(--bg-input)] text-[var(--text-primary)] rounded-md px-3 py-2 text-sm border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </div>
          <div>
            <label class="block text-sm text-[var(--text-muted)] mb-1">Description</label>
            <textarea
              class="w-full bg-[var(--bg-input)] text-[var(--text-primary)] rounded-md px-3 py-2 text-sm border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none resize-none"
              rows={3}
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />
          </div>
          <div class="flex justify-end gap-3">
            <button
              class="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              onClick={() => store.setShowCommunitySettings(false)}
            >
              Cancel
            </button>
            <button
              class="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              onClick={handleSave}
              disabled={saving()}
            >
              {saving() ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

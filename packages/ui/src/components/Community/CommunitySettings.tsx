import { createSignal, type JSX } from 'solid-js'
import { Modal } from '../Shared/Modal.js'

export interface CommunitySettingsProps {
  communityId: string
  name: string
  description?: string
  onSave: (name: string, description: string) => void
  onClose: () => void
  open: boolean
}

export function CommunitySettings(props: CommunitySettingsProps): JSX.Element {
  const [name, setName] = createSignal(props.name)
  const [description, setDescription] = createSignal(props.description ?? '')

  return (
    <Modal open={props.open} onClose={props.onClose} title="Community Settings">
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-hm-text mb-1">Community Name</label>
          <input
            class="w-full bg-hm-bg-dark text-hm-text rounded-md px-3 py-2 text-sm border border-hm-bg-darker focus:border-hm-accent focus:outline-none"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </div>
        <div>
          <label class="block text-sm text-hm-text mb-1">Description</label>
          <textarea
            class="w-full bg-hm-bg-dark text-hm-text rounded-md px-3 py-2 text-sm border border-hm-bg-darker focus:border-hm-accent focus:outline-none resize-none"
            rows={3}
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
          />
        </div>
        <div class="flex justify-end gap-3">
          <button
            class="px-4 py-2 text-sm text-hm-text-muted hover:text-white transition-colors"
            onClick={() => props.onClose()}
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 bg-hm-accent hover:bg-hm-accent-hover text-white rounded-md text-sm font-medium transition-colors"
            onClick={() => props.onSave(name(), description())}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

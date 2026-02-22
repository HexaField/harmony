import { createSignal, type JSX } from 'solid-js'
import { Modal } from '../Shared/Modal.js'

export interface CreateCommunityDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, description: string) => void
}

export function CreateCommunityDialog(props: CreateCommunityDialogProps): JSX.Element {
  const [name, setName] = createSignal('')
  const [description, setDescription] = createSignal('')

  const handleCreate = () => {
    const n = name().trim()
    if (!n) return
    props.onCreate(n, description().trim())
    setName('')
    setDescription('')
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="Create a Community">
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-hm-text mb-1">Community Name</label>
          <input
            class="w-full bg-hm-bg-dark text-hm-text rounded-md px-3 py-2 text-sm border border-hm-bg-darker focus:border-hm-accent focus:outline-none"
            placeholder="My Community"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </div>
        <div>
          <label class="block text-sm text-hm-text mb-1">Description (optional)</label>
          <textarea
            class="w-full bg-hm-bg-dark text-hm-text rounded-md px-3 py-2 text-sm border border-hm-bg-darker focus:border-hm-accent focus:outline-none resize-none"
            rows={2}
            placeholder="What's this community about?"
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
            class="px-4 py-2 bg-hm-accent hover:bg-hm-accent-hover text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            disabled={!name().trim()}
            onClick={handleCreate}
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  )
}

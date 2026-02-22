import { createSignal, type JSX } from 'solid-js'
import { Modal } from '../Shared/Modal.js'

export interface JoinCommunityDialogProps {
  open: boolean
  onClose: () => void
  onJoin: (communityId: string) => void
}

export function JoinCommunityDialog(props: JoinCommunityDialogProps): JSX.Element {
  const [communityId, setCommunityId] = createSignal('')

  const handleJoin = () => {
    const id = communityId().trim()
    if (!id) return
    props.onJoin(id)
    setCommunityId('')
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="Join a Community">
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-hm-text mb-1">Community ID or Invite Link</label>
          <input
            class="w-full bg-hm-bg-dark text-hm-text rounded-md px-3 py-2 text-sm border border-hm-bg-darker focus:border-hm-accent focus:outline-none font-mono"
            placeholder="Enter community ID..."
            value={communityId()}
            onInput={(e) => setCommunityId(e.currentTarget.value)}
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
            class="px-4 py-2 bg-hm-green hover:bg-hm-green/80 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            disabled={!communityId().trim()}
            onClick={handleJoin}
          >
            Join
          </button>
        </div>
      </div>
    </Modal>
  )
}

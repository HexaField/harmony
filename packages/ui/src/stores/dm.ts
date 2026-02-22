import { createSignal } from 'solid-js'
import type { DMChannelState } from '@harmony/client'

export function createDMStore() {
  const [channels, setChannels] = createSignal<DMChannelState[]>([])
  const [activeRecipientDID, setActiveRecipientDID] = createSignal<string | null>(null)

  return {
    channels,
    activeRecipientDID,
    setActiveRecipient(did: string | null) {
      setActiveRecipientDID(did)
    },
    updateChannels(chs: DMChannelState[]) {
      setChannels(chs)
    },
    markRead(recipientDID: string) {
      setChannels((prev) => prev.map((c) => (c.recipientDID === recipientDID ? { ...c, unreadCount: 0 } : c)))
    }
  }
}

export type DMStore = ReturnType<typeof createDMStore>

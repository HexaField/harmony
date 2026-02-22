import { createSignal } from 'solid-js'
import type { DecryptedMessage, ChannelInfo } from '@harmony/client'

export function createChannelStore() {
  const [activeChannelId, setActiveChannelId] = createSignal<string | null>(null)
  const [messages, setMessages] = createSignal<DecryptedMessage[]>([])
  const [channels, setChannels] = createSignal<ChannelInfo[]>([])
  const [typingUsers, setTypingUsers] = createSignal<string[]>([])
  const [loading, setLoading] = createSignal(false)

  return {
    activeChannelId,
    messages,
    channels,
    typingUsers,
    loading,
    setActiveChannel(id: string) {
      setActiveChannelId(id)
    },
    setMessages(msgs: DecryptedMessage[]) {
      setMessages(msgs)
    },
    setChannels(chs: ChannelInfo[]) {
      setChannels(chs)
    },
    addTypingUser(did: string) {
      setTypingUsers((prev) => (prev.includes(did) ? prev : [...prev, did]))
    },
    removeTypingUser(did: string) {
      setTypingUsers((prev) => prev.filter((d) => d !== did))
    },
    setLoading(l: boolean) {
      setLoading(l)
    }
  }
}

export type ChannelStore = ReturnType<typeof createChannelStore>

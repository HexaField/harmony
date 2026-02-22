import { createSignal, createEffect, onCleanup } from 'solid-js'
import type { ChannelSubscription, DecryptedMessage } from '@harmony/client'
import { useClient } from './useClient.js'

export function useChannel(communityId: () => string | null, channelId: () => string | null) {
  const { client } = useClient()
  const [messages, setMessages] = createSignal<DecryptedMessage[]>([])
  const [loading, setLoading] = createSignal(false)
  const [hasMore, setHasMore] = createSignal(false)
  let subscription: ChannelSubscription | null = null

  createEffect(() => {
    const c = client()
    const cId = communityId()
    const chId = channelId()

    if (subscription) {
      subscription.unsubscribe()
      subscription = null
    }

    if (c && cId && chId) {
      subscription = c.subscribeChannel(cId, chId)
      setMessages(subscription.messages)
      setLoading(subscription.loading)
      setHasMore(subscription.hasMore)
    }
  })

  onCleanup(() => {
    subscription?.unsubscribe()
  })

  return {
    messages,
    loading,
    hasMore,
    loadMore: async () => {
      if (subscription) await subscription.loadMore()
    },
    sendTyping: () => {
      subscription?.sendTyping()
    }
  }
}

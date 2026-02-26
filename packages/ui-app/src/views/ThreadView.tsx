import { createSignal, Show, For, type Component, onMount } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const ThreadView: Component = () => {
  const store = useAppStore()
  const [newMessage, setNewMessage] = createSignal('')
  let messagesEndRef: HTMLDivElement | undefined

  const thread = () => store.activeThread()
  const messages = () => (thread() ? store.threadMessages(thread()!.threadId) : [])

  // Find the parent message from channel messages
  const parentMessage = () => {
    const t = thread()
    if (!t) return null
    const channelMsgs = store.channelMessages(t.channelId)
    return channelMsgs.find((m) => m.id === t.parentMessageId) ?? null
  }

  onMount(() => {
    scrollToBottom()
  })

  function scrollToBottom() {
    messagesEndRef?.scrollIntoView({ behavior: 'smooth' })
  }

  async function sendMessage() {
    const text = newMessage().trim()
    const t = thread()
    const client = store.client()
    if (!text || !t || !client) return

    try {
      await client.sendThreadMessage(t.threadId, text)
      setNewMessage('')
      setTimeout(scrollToBottom, 100)
    } catch (err) {
      console.error('Failed to send thread message:', err)
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <Show when={thread()}>
      <div class="w-96 bg-[var(--bg-secondary)] border-l border-[var(--border)] flex flex-col h-full">
        {/* Header */}
        <div class="h-12 flex items-center px-4 border-b border-[var(--border)] shrink-0">
          <span class="font-semibold flex-1 truncate">{thread()!.name}</span>
          <button
            onClick={() => store.setActiveThread(null)}
            class="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title={t('THREAD_CLOSE')}
          >
            ✕
          </button>
        </div>

        {/* Parent message */}
        <Show when={parentMessage()}>
          <div class="px-4 py-3 bg-[var(--bg-surface)]/50 border-b border-[var(--border)]">
            <p class="text-xs text-[var(--text-muted)] mb-1">{t('THREAD_PARENT_MESSAGE')}</p>
            <div class="flex items-start gap-2">
              <div class="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xs shrink-0">
                {parentMessage()!.authorName.charAt(0).toUpperCase()}
              </div>
              <div>
                <span class="font-semibold text-sm">{parentMessage()!.authorName}</span>
                <p class="text-sm text-[var(--text-secondary)] mt-0.5">{parentMessage()!.content}</p>
              </div>
            </div>
          </div>
        </Show>

        {/* Thread messages */}
        <div class="flex-1 overflow-y-auto px-4 py-2">
          <For each={messages()}>
            {(msg) => (
              <div class="flex items-start gap-2 py-1.5">
                <div class="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xs shrink-0 mt-0.5">
                  {msg.authorName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div class="flex items-baseline gap-2">
                    <span class="font-semibold text-sm">{msg.authorName}</span>
                    <span class="text-[10px] text-[var(--text-muted)]">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p class="text-sm text-[var(--text-secondary)]">{msg.content}</p>
                </div>
              </div>
            )}
          </For>
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <div class="p-3 border-t border-[var(--border)]">
          <div class="flex items-center gap-2 bg-[var(--bg-input)] rounded-lg px-3 py-2">
            <input
              type="text"
              value={newMessage()}
              onInput={(e) => setNewMessage(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('THREAD_MESSAGE_PLACEHOLDER')}
              class="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage().trim()}
              class="text-[var(--accent)] hover:text-[var(--accent-hover)] disabled:opacity-30 transition-colors text-sm font-semibold"
            >
              ↵
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}

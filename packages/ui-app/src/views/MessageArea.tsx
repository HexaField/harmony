import { For, Show, createSignal, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { MessageInput as MessageInputLogic } from '../components/Messaging/index.js'
import { MarkdownRenderer } from '../components/Shared/index.js'
import { RelativeTime } from '../components/Shared/index.js'
import { t } from '../i18n/strings.js'
import type { MessageData } from '../types.js'

export const MessageArea: Component = () => {
  const store = useAppStore()
  const [inputContent, setInputContent] = createSignal('')
  let messagesEndRef: HTMLDivElement | undefined

  const activeChannel = () => store.channels().find((c) => c.id === store.activeChannelId())

  const channelMessages = () => store.messages().filter((m) => true) // In production, filter by channel

  function sendMessage() {
    const text = inputContent().trim()
    if (!text) return

    const msg: MessageData = {
      id: 'msg:' + Date.now().toString(36),
      content: text,
      authorDid: store.did(),
      authorName: 'You',
      timestamp: new Date().toISOString(),
      reactions: []
    }
    store.addMessage(msg)
    setInputContent('')

    // Auto-scroll to bottom
    requestAnimationFrame(() => {
      messagesEndRef?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div class="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div class="flex-1 overflow-y-auto px-4 py-2">
        <Show when={channelMessages().length === 0}>
          <div class="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <div class="text-4xl mb-4">#</div>
            <h3 class="text-xl font-bold text-[var(--text-primary)] mb-1">
              {t('ONBOARDING_WELCOME')} #{activeChannel()?.name ?? ''}
            </h3>
            <p class="text-sm">{t('MESSAGE_PLACEHOLDER', { channel: activeChannel()?.name ?? '' })}</p>
          </div>
        </Show>

        <For each={channelMessages()}>
          {(msg, i) => {
            const prevMsg = () => (i() > 0 ? channelMessages()[i() - 1] : null)
            const isGrouped = () => {
              const prev = prevMsg()
              if (!prev) return false
              return (
                prev.authorDid === msg.authorDid &&
                new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime() < 300000
              )
            }

            const md = MarkdownRenderer({ content: msg.content })
            const timeInfo = RelativeTime({ timestamp: msg.timestamp })
            const initials = (msg.authorName ?? msg.authorDid).substring(0, 2).toUpperCase()

            return (
              <div
                class="group flex px-2 py-0.5 hover:bg-[var(--bg-surface)]/30 rounded transition-colors"
                classList={{ 'mt-4': !isGrouped(), 'mt-0': isGrouped() }}
              >
                <Show
                  when={!isGrouped()}
                  fallback={
                    <div class="w-10 shrink-0 flex items-start justify-center pt-1">
                      <span class="text-[10px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  }
                >
                  <div class="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5">
                    {initials}
                  </div>
                </Show>
                <div class="ml-3 min-w-0 flex-1">
                  <Show when={!isGrouped()}>
                    <div class="flex items-baseline gap-2">
                      <span class="font-semibold text-sm hover:underline cursor-pointer">{msg.authorName}</span>
                      <span class="text-xs text-[var(--text-muted)]">{timeInfo.display}</span>
                    </div>
                  </Show>
                  <div class="text-sm text-[var(--text-primary)] leading-relaxed break-words">
                    <For each={md.segments}>
                      {(seg) => {
                        if (seg.type === 'code-block')
                          return (
                            <pre class="bg-[var(--bg-input)] p-2 rounded my-1 text-xs overflow-x-auto">
                              <code>{seg.content}</code>
                            </pre>
                          )
                        if (seg.type === 'code')
                          return <code class="bg-[var(--bg-input)] px-1 py-0.5 rounded text-xs">{seg.content}</code>
                        if (seg.type === 'bold') return <strong>{seg.content.replace(/\*\*/g, '')}</strong>
                        if (seg.type === 'heading') return <strong class="text-base">{seg.content}</strong>
                        return <span>{seg.content}</span>
                      }}
                    </For>
                  </div>
                  {/* Reactions */}
                  <Show when={msg.reactions && msg.reactions.length > 0}>
                    <div class="flex gap-1 mt-1">
                      <For each={msg.reactions}>
                        {(reaction) => (
                          <button
                            class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors"
                            classList={{
                              'bg-[var(--accent)]/20 border border-[var(--accent)]': reaction.userReacted,
                              'bg-[var(--bg-input)] hover:bg-[var(--border)]': !reaction.userReacted
                            }}
                          >
                            <span>{reaction.emoji}</span>
                            <span class="text-[var(--text-muted)]">{reaction.count}</span>
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
            )
          }}
        </For>
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div class="px-4 pb-6 pt-2 shrink-0">
        <div class="flex items-end bg-[var(--bg-input)] rounded-lg border border-[var(--border)] focus-within:border-[var(--accent)] transition-colors">
          <button class="p-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0" title="Attach file">
            📎
          </button>
          <textarea
            value={inputContent()}
            onInput={(e) => setInputContent(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            class="flex-1 py-3 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none text-sm"
            placeholder={t('MESSAGE_PLACEHOLDER', { channel: activeChannel()?.name ?? 'channel' })}
            style={{ 'max-height': '120px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!inputContent().trim()}
            class="p-3 text-[var(--accent)] hover:text-[var(--accent-hover)] disabled:text-[var(--text-muted)] disabled:cursor-default shrink-0 transition-colors"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  )
}

import { For, Show, createSignal, createEffect, on, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { MarkdownRenderer, addToast } from '../components/Shared/index.js'
import { RelativeTime } from '../components/Shared/index.js'
import { t } from '../i18n/strings.js'
import { pseudonymFromDid } from '../utils/pseudonym.js'
import type { MessageData } from '../types.js'

export const DMConversationView: Component = () => {
  const store = useAppStore()
  const [inputContent, setInputContent] = createSignal('')
  const [editContent, setEditContent] = createSignal('')
  const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null)
  let messagesEndRef: HTMLDivElement | undefined
  let typingTimeout: ReturnType<typeof setTimeout> | undefined

  const recipientDid = () => store.activeDMRecipient()
  const recipientName = () => {
    const did = recipientDid()
    if (!did) return ''
    const convo = store.dmConversations().find((c) => c.participantDid === did)
    return convo?.participantName ?? pseudonymFromDid(did)
  }

  const currentMessages = () => {
    const did = recipientDid()
    if (!did) return []
    return store.dmMessages(did)
  }

  createEffect(
    on(recipientDid, (did) => {
      if (did) {
        store.markDMRead(did)
        requestAnimationFrame(() => messagesEndRef?.scrollIntoView({ behavior: 'instant' }))
      }
    })
  )

  async function sendMessage() {
    const text = inputContent().trim()
    const recipient = recipientDid()
    if (!text || !recipient) return
    const client = store.client()
    if (client?.isConnected()) {
      try {
        const msgId = await client.sendDM(recipient, text)
        const msg: MessageData = {
          id: msgId,
          content: text,
          authorDid: store.did(),
          authorName: store.displayName() || pseudonymFromDid(store.did()),
          timestamp: new Date().toISOString(),
          reactions: []
        }
        store.addDMMessage(recipient, msg)
        setInputContent('')
        requestAnimationFrame(() => messagesEndRef?.scrollIntoView({ behavior: 'smooth' }))
      } catch (err) {
        console.error('Failed to send DM:', err)
        addToast({ message: t('DM_SEND_FAILED'), type: 'error' })
        addLocalDM(text)
      }
    } else {
      addLocalDM(text)
    }
  }

  function addLocalDM(text: string) {
    const recipient = recipientDid()
    if (!recipient) return
    const msg: MessageData = {
      id: 'dm:' + Date.now().toString(36),
      content: text,
      authorDid: store.did(),
      authorName: store.displayName() || pseudonymFromDid(store.did()),
      timestamp: new Date().toISOString(),
      reactions: []
    }
    store.addDMMessage(recipient, msg)
    setInputContent('')
    requestAnimationFrame(() => messagesEndRef?.scrollIntoView({ behavior: 'smooth' }))
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleInputForTyping() {
    const client = store.client()
    const recipient = recipientDid()
    if (!client?.isConnected() || !recipient) return
    if (typingTimeout) clearTimeout(typingTimeout)
    // Send typing indicator — using the raw send if available
    try {
      ;(client as any).send?.((client as any).createMessage?.('dm.typing', { recipientDID: recipient }))
    } catch {
      /* ignore */
    }
    typingTimeout = setTimeout(() => {
      typingTimeout = undefined
    }, 2000)
  }

  function startEdit(msg: MessageData) {
    store.setEditingMessageId(msg.id)
    setEditContent(msg.content)
  }

  async function saveEdit(msgId: string) {
    const newText = editContent().trim()
    const recipient = recipientDid()
    if (!newText || !recipient) return
    const client = store.client()
    if (client) {
      try {
        await client.editDM(recipient, msgId, newText)
        store.updateDMMessage(recipient, msgId, newText)
      } catch (err) {
        console.error('Failed to edit DM:', err)
        addToast({ message: t('DM_EDIT_FAILED'), type: 'error' })
      }
    }
    store.setEditingMessageId(null)
  }

  function cancelEdit() {
    store.setEditingMessageId(null)
  }

  async function handleDelete(msgId: string) {
    const recipient = recipientDid()
    if (!recipient) return
    const client = store.client()
    if (client) {
      try {
        await client.deleteDM(recipient, msgId)
        store.removeDMMessage(recipient, msgId)
      } catch (err) {
        console.error('Failed to delete DM:', err)
        addToast({ message: t('DM_DELETE_FAILED'), type: 'error' })
      }
    }
    setConfirmDelete(null)
  }

  const isOwnMessage = (msg: MessageData) => msg.authorDid === store.did()

  return (
    <div class="flex flex-col flex-1 min-h-0">
      {/* DM Title bar */}
      <div class="h-12 flex items-center px-4 bg-[var(--bg-secondary)] border-b border-[var(--border)] shrink-0">
        <button
          onClick={() => store.setActiveDMRecipient(null)}
          class="md:hidden text-[var(--text-muted)] hover:text-[var(--text-primary)] mr-2 transition-colors text-sm"
        >
          ←
        </button>
        <span class="text-[var(--text-muted)] mr-2">💬</span>
        <span class="font-semibold">{recipientName()}</span>
      </div>

      {/* Messages */}
      <div class="flex-1 overflow-y-auto px-4 py-2">
        <Show when={currentMessages().length === 0}>
          <div class="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <div class="text-4xl mb-4">💬</div>
            <p class="text-sm">{t('DM_CONVERSATION_EMPTY')}</p>
          </div>
        </Show>

        <For each={currentMessages()}>
          {(msg, i) => {
            const prevMsg = () => (i() > 0 ? currentMessages()[i() - 1] : null)
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
            const displayAuthor = msg.authorName ?? pseudonymFromDid(msg.authorDid)
            const initials = displayAuthor.substring(0, 2).toUpperCase()
            const isEditing = () => store.editingMessageId() === msg.id

            return (
              <div
                class="group flex px-2 py-0.5 hover:bg-[var(--bg-surface)]/30 rounded transition-colors relative"
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
                      <Show when={msg.edited}>
                        <span class="text-xs text-[var(--text-muted)] italic">{t('MESSAGE_EDITED_LABEL')}</span>
                      </Show>
                    </div>
                  </Show>

                  <Show
                    when={isEditing()}
                    fallback={
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
                            if (seg.type === 'bold') return <strong>{seg.content}</strong>
                            if (seg.type === 'italic') return <em>{seg.content}</em>
                            if (seg.type === 'strikethrough') return <span class="line-through">{seg.content}</span>
                            if (seg.type === 'spoiler')
                              return (
                                <span class="bg-[var(--text-muted)] text-transparent hover:text-[var(--text-primary)] hover:bg-transparent rounded px-0.5 cursor-pointer transition-colors">
                                  {seg.content}
                                </span>
                              )
                            if (seg.type === 'link')
                              return (
                                <a
                                  href={(seg as any).href ?? seg.content}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="text-[var(--accent)] hover:underline"
                                >
                                  {seg.content}
                                </a>
                              )
                            if (seg.type === 'mention')
                              return (
                                <span class="bg-[var(--accent)]/20 text-[var(--accent)] rounded px-0.5 font-medium">
                                  @{seg.content}
                                </span>
                              )
                            if (seg.type === 'heading') return <strong class="text-base">{seg.content}</strong>
                            if (seg.type === 'blockquote')
                              return (
                                <div class="border-l-2 border-[var(--text-muted)] pl-2 ml-1 text-[var(--text-muted)] italic">
                                  {seg.content}
                                </div>
                              )
                            if (seg.type === 'list-item')
                              return (
                                <div class="flex gap-1">
                                  <span class="text-[var(--text-muted)]">•</span>
                                  <span>{seg.content}</span>
                                </div>
                              )
                            if (seg.type === 'newline') return <br />
                            return <span>{seg.content}</span>
                          }}
                        </For>
                      </div>
                    }
                  >
                    <div class="space-y-1">
                      <textarea
                        value={editContent()}
                        onInput={(e) => setEditContent(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            saveEdit(msg.id)
                          }
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        class="w-full p-2 rounded bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm resize-none"
                        rows={2}
                        autofocus
                      />
                      <div class="flex gap-2 text-xs">
                        <button onClick={() => saveEdit(msg.id)} class="text-[var(--accent)] hover:underline">
                          {t('MESSAGE_EDIT_SAVE')}
                        </button>
                        <button onClick={cancelEdit} class="text-[var(--text-muted)] hover:underline">
                          {t('MESSAGE_EDIT_CANCEL')}
                        </button>
                      </div>
                    </div>
                  </Show>
                </div>

                {/* Hover actions */}
                <Show when={isOwnMessage(msg)}>
                  <div class="absolute right-2 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 bg-[var(--bg-surface)] rounded border border-[var(--border)] shadow-sm">
                    <button
                      onClick={() => startEdit(msg)}
                      class="p-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      title={t('MESSAGE_EDIT')}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => setConfirmDelete(msg.id)}
                      class="p-1 text-xs text-[var(--text-muted)] hover:text-[var(--error)]"
                      title={t('MESSAGE_DELETE')}
                    >
                      🗑️
                    </button>
                  </div>
                </Show>

                {/* Delete confirmation */}
                <Show when={confirmDelete() === msg.id}>
                  <div class="absolute right-2 top-8 bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] shadow-lg p-3 z-10 text-sm">
                    <p class="mb-2 text-[var(--text-primary)]">{t('MESSAGE_DELETE_CONFIRM')}</p>
                    <div class="flex gap-2 justify-end">
                      <button
                        onClick={() => setConfirmDelete(null)}
                        class="px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        {t('MESSAGE_DELETE_NO')}
                      </button>
                      <button
                        onClick={() => handleDelete(msg.id)}
                        class="px-2 py-1 text-xs bg-[var(--error)] text-white rounded hover:opacity-80"
                      >
                        {t('MESSAGE_DELETE_YES')}
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            )
          }}
        </For>
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      <Show when={store.dmTypingUsers().length > 0}>
        <div class="px-4 py-1 text-xs text-[var(--text-muted)] italic">
          <Show when={store.dmTypingUsers().length === 1}>
            {t('DM_TYPING_SINGLE', { user: store.dmTypingUsers()[0] })}
          </Show>
          <Show when={store.dmTypingUsers().length > 1}>
            {t('DM_TYPING_MULTIPLE', { count: store.dmTypingUsers().length })}
          </Show>
        </div>
      </Show>

      {/* Message input */}
      <div class="px-4 pb-6 mobile-input-safe pt-2 shrink-0">
        <div class="flex items-end bg-[var(--bg-input)] rounded-lg border border-[var(--border)] focus-within:border-[var(--accent)] transition-colors">
          <textarea
            value={inputContent()}
            onInput={(e) => {
              setInputContent(e.currentTarget.value)
              handleInputForTyping()
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            class="flex-1 py-3 px-3 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none text-sm"
            placeholder={t('DM_SEND_PLACEHOLDER', { recipient: recipientName() })}
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

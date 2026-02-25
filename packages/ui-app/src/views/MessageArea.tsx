import { For, Show, createSignal, createEffect, on, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { MarkdownRenderer } from '../components/Shared/index.js'
import { RelativeTime } from '../components/Shared/index.js'
import { addToast } from '../components/Shared/index.js'
import { t } from '../i18n/strings.js'
import type { MessageData, AttachmentData } from '../types.js'
import { pseudonymFromDid } from '../utils/pseudonym.js'

const COMMON_EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👀']
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.includes(mimeType)
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType.startsWith('audio/')) return '🎵'
  if (mimeType.includes('pdf')) return '📄'
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('compress')) return '📦'
  return '📎'
}

export const MessageArea: Component = () => {
  const store = useAppStore()
  const [inputContent, setInputContent] = createSignal('')
  const [loadingHistory, setLoadingHistory] = createSignal(false)
  const [editContent, setEditContent] = createSignal('')
  const [showEmojiPicker, setShowEmojiPicker] = createSignal<string | null>(null)
  const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null)
  const [pendingAttachments, setPendingAttachments] = createSignal<AttachmentData[]>([])
  const [uploading, setUploading] = createSignal(false)
  const [uploadProgress, setUploadProgress] = createSignal('')
  const [dragging, setDragging] = createSignal(false)
  const [lightboxSrc, setLightboxSrc] = createSignal<string | null>(null)
  let messagesEndRef: HTMLDivElement | undefined
  let typingTimeout: ReturnType<typeof setTimeout> | undefined
  let fileInputRef: HTMLInputElement | undefined
  let dragCounter = 0

  const activeChannel = () => store.channels().find((c) => c.id === store.activeChannelId())

  const channelMessages = () => {
    const channelId = store.activeChannelId()
    if (!channelId) return []
    const cached = store.channelMessages(channelId)
    const global = store.messages()
    return cached.length > 0 ? cached : global
  }

  createEffect(
    on(
      () => store.activeChannelId(),
      (channelId) => {
        if (!channelId) return
        const client = store.client()
        const communityId = store.activeCommunityId()
        if (client?.isConnected() && communityId) {
          setLoadingHistory(true)
          client
            .syncChannel(communityId, channelId, { limit: 50 })
            .catch(() => {})
            .finally(() => setLoadingHistory(false))
        }
        const cached = store.channelMessages(channelId)
        store.setMessages(cached.length > 0 ? cached : [])
        requestAnimationFrame(() => messagesEndRef?.scrollIntoView({ behavior: 'instant' }))
      }
    )
  )

  async function handleFiles(files: FileList | File[]) {
    const client = store.client()
    const communityId = store.activeCommunityId()
    const channelId = store.activeChannelId()

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        addToast({
          message: t('FILE_UPLOAD_TOO_LARGE', { maxSize: formatFileSize(MAX_FILE_SIZE) }),
          type: 'error'
        })
        continue
      }

      setUploading(true)
      setUploadProgress(t('FILE_UPLOAD_UPLOADING', { filename: file.name }))

      try {
        const arrayBuffer = await file.arrayBuffer()
        const data = new Uint8Array(arrayBuffer)

        if (client?.isConnected() && communityId && channelId) {
          const ref = await client.uploadFile(communityId, channelId, {
            data,
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size
          })
          const attachment: AttachmentData = {
            id: ref.id,
            filename: ref.filename,
            url: ref.url,
            mimeType: ref.contentType,
            size: ref.originalSize
          }
          setPendingAttachments((prev) => [...prev, attachment])
        } else {
          // Offline/local: create a local blob URL
          const blob = new Blob([data], { type: file.type })
          const url = URL.createObjectURL(blob)
          const attachment: AttachmentData = {
            id: 'local:' + Date.now().toString(36),
            filename: file.name,
            url,
            mimeType: file.type || 'application/octet-stream',
            size: file.size
          }
          setPendingAttachments((prev) => [...prev, attachment])
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        addToast({
          message: t('FILE_UPLOAD_FAILED', { error: errorMsg }),
          type: 'error'
        })
      }
    }

    setUploading(false)
    setUploadProgress('')
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault()
    dragCounter++
    if (e.dataTransfer?.types.includes('Files')) {
      setDragging(true)
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault()
    dragCounter--
    if (dragCounter <= 0) {
      dragCounter = 0
      setDragging(false)
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    dragCounter = 0
    setDragging(false)
    if (e.dataTransfer?.files.length) {
      handleFiles(e.dataTransfer.files)
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      handleFiles(files)
    }
  }

  async function sendMessage() {
    const text = inputContent().trim()
    const attachments = pendingAttachments()
    if (!text && attachments.length === 0) return
    const client = store.client()
    const communityId = store.activeCommunityId()
    const channelId = store.activeChannelId()
    if (client?.isConnected() && communityId && channelId) {
      try {
        const msgId = await client.sendMessage(communityId, channelId, text)
        const msg: MessageData = {
          id: msgId,
          content: text,
          authorDid: store.did(),
          authorName: store.displayName() || pseudonymFromDid(store.did()),
          timestamp: new Date().toISOString(),
          reactions: [],
          attachments: attachments.length > 0 ? attachments : undefined
        }
        store.addMessage(msg)
        store.addChannelMessage(channelId, msg)
        setInputContent('')
        setPendingAttachments([])
        requestAnimationFrame(() => messagesEndRef?.scrollIntoView({ behavior: 'smooth' }))
      } catch (err) {
        console.error('Failed to send message:', err)
        addLocalMessage(text, attachments)
      }
    } else {
      addLocalMessage(text, attachments)
    }
  }

  function addLocalMessage(text: string, attachments?: AttachmentData[]) {
    const channelId = store.activeChannelId()
    const msg: MessageData = {
      id: 'msg:' + Date.now().toString(36),
      content: text,
      authorDid: store.did(),
      authorName: store.displayName() || pseudonymFromDid(store.did()),
      timestamp: new Date().toISOString(),
      reactions: [],
      attachments: attachments && attachments.length > 0 ? attachments : undefined
    }
    store.addMessage(msg)
    if (channelId) store.addChannelMessage(channelId, msg)
    setInputContent('')
    setPendingAttachments([])
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
    const communityId = store.activeCommunityId()
    const channelId = store.activeChannelId()
    if (!client?.isConnected() || !communityId || !channelId) return
    if (typingTimeout) clearTimeout(typingTimeout)
    const sub = client.subscribeChannel(communityId, channelId)
    sub.sendTyping()
    sub.unsubscribe()
    typingTimeout = setTimeout(() => {
      typingTimeout = undefined
    }, 2000)
  }

  // Edit message
  function startEdit(msg: MessageData) {
    store.setEditingMessageId(msg.id)
    setEditContent(msg.content)
  }

  async function saveEdit(msgId: string) {
    const newText = editContent().trim()
    if (!newText) return
    const client = store.client()
    const communityId = store.activeCommunityId()
    const channelId = store.activeChannelId()
    if (client && communityId && channelId) {
      try {
        await client.editMessage(communityId, channelId, msgId, newText)
        store.updateMessage(channelId, msgId, newText)
      } catch (err) {
        console.error('Failed to edit:', err)
      }
    }
    store.setEditingMessageId(null)
  }

  function cancelEdit() {
    store.setEditingMessageId(null)
  }

  // Delete message
  async function handleDelete(msgId: string) {
    const client = store.client()
    const communityId = store.activeCommunityId()
    const channelId = store.activeChannelId()
    if (client && communityId && channelId) {
      try {
        await client.deleteMessage(communityId, channelId, msgId)
        store.removeMessage(channelId, msgId)
      } catch (err) {
        console.error('Failed to delete:', err)
      }
    }
    setConfirmDelete(null)
  }

  // Reactions
  async function toggleReaction(msgId: string, emoji: string) {
    const client = store.client()
    const communityId = store.activeCommunityId()
    const channelId = store.activeChannelId()
    if (!client || !communityId || !channelId) return
    try {
      const msgs = channelMessages()
      const msg = msgs.find((m) => m.id === msgId)
      const existing = msg?.reactions?.find((r) => r.emoji === emoji)
      if (existing?.userReacted) {
        await client.removeReaction(communityId, channelId, msgId, emoji)
      } else {
        await client.addReaction(communityId, channelId, msgId, emoji)
      }
    } catch (err) {
      console.error('Reaction failed:', err)
    }
    setShowEmojiPicker(null)
  }

  const isDisconnected = () => store.connectionState() === 'disconnected'
  const isOwnMessage = (msg: MessageData) => msg.authorDid === store.did()

  return (
    <div
      class="flex flex-col flex-1 min-h-0 relative"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <Show when={dragging()}>
        <div class="absolute inset-0 z-50 bg-[var(--accent)]/10 border-2 border-dashed border-[var(--accent)] rounded-lg flex items-center justify-center pointer-events-none">
          <div class="text-lg font-semibold text-[var(--accent)]">{t('FILE_UPLOAD_DROP_ZONE')}</div>
        </div>
      </Show>

      {/* Lightbox */}
      <Show when={lightboxSrc()}>
        <div
          class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxSrc(null)}
        >
          <img src={lightboxSrc()!} class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" alt="" />
        </div>
      </Show>
      {/* Messages */}
      <div class="flex-1 overflow-y-auto px-4 py-2">
        <Show when={loadingHistory()}>
          <div class="flex items-center justify-center py-4 text-[var(--text-muted)] text-sm">
            {t('MESSAGES_LOADING_HISTORY')}
          </div>
        </Show>

        <Show when={channelMessages().length === 0 && !loadingHistory()}>
          <div class="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <Show
              when={!isDisconnected()}
              fallback={
                <>
                  <div class="text-4xl mb-4">📡</div>
                  <p class="text-sm">{t('MESSAGES_CONNECTING')}</p>
                </>
              }
            >
              <div class="text-4xl mb-4">#</div>
              <h3 class="text-xl font-bold text-[var(--text-primary)] mb-1">
                {t('ONBOARDING_WELCOME')} #{activeChannel()?.name ?? ''}
              </h3>
              <p class="text-sm">{t('MESSAGE_PLACEHOLDER', { channel: activeChannel()?.name ?? '' })}</p>
            </Show>
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
            const resolvedName = () => {
              const member = store.members().find((m) => m.did === msg.authorDid)
              return member?.displayName || msg.authorName || pseudonymFromDid(msg.authorDid)
            }
            const initials = () => resolvedName().substring(0, 2).toUpperCase()
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
                    {initials()}
                  </div>
                </Show>
                <div class="ml-3 min-w-0 flex-1">
                  <Show when={!isGrouped()}>
                    <div class="flex items-baseline gap-2">
                      <span class="font-semibold text-sm hover:underline cursor-pointer">{resolvedName()}</span>
                      <span class="text-xs text-[var(--text-muted)]">{timeInfo.display}</span>
                      <Show when={msg.edited}>
                        <span class="text-xs text-[var(--text-muted)] italic">{t('MESSAGE_EDITED_LABEL')}</span>
                      </Show>
                    </div>
                  </Show>

                  {/* Message content or edit form */}
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
                            if (seg.type === 'bold') return <strong>{seg.content.replace(/\*\*/g, '')}</strong>
                            if (seg.type === 'heading') return <strong class="text-base">{seg.content}</strong>
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

                  {/* Reactions display */}
                  <Show when={msg.reactions && msg.reactions.length > 0}>
                    <div class="flex gap-1 mt-1 flex-wrap">
                      <For each={msg.reactions}>
                        {(reaction) => (
                          <button
                            onClick={() => toggleReaction(msg.id, reaction.emoji)}
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

                  {/* Attachments */}
                  <Show when={msg.attachments && msg.attachments.length > 0}>
                    <div class="flex flex-col gap-2 mt-2">
                      <For each={msg.attachments}>
                        {(attachment) => (
                          <Show
                            when={isImageMimeType(attachment.mimeType)}
                            fallback={
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={attachment.filename}
                                class="flex items-center gap-2 px-3 py-2 bg-[var(--bg-input)] rounded-lg border border-[var(--border)] hover:border-[var(--accent)] transition-colors max-w-xs"
                              >
                                <span class="text-lg shrink-0">{fileIcon(attachment.mimeType)}</span>
                                <div class="min-w-0 flex-1">
                                  <div class="text-sm text-[var(--accent)] truncate">{attachment.filename}</div>
                                  <div class="text-xs text-[var(--text-muted)]">{formatFileSize(attachment.size)}</div>
                                </div>
                              </a>
                            }
                          >
                            <div class="max-w-sm">
                              <img
                                src={attachment.url}
                                alt={attachment.filename}
                                class="rounded-lg max-h-80 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setLightboxSrc(attachment.url)}
                                loading="lazy"
                              />
                              <div class="text-xs text-[var(--text-muted)] mt-0.5">
                                {attachment.filename} — {formatFileSize(attachment.size)}
                              </div>
                            </div>
                          </Show>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>

                {/* Hover actions */}
                <div class="absolute right-2 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 bg-[var(--bg-surface)] rounded border border-[var(--border)] shadow-sm">
                  {/* Reaction button */}
                  <button
                    onClick={() => setShowEmojiPicker(showEmojiPicker() === msg.id ? null : msg.id)}
                    class="p-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    title={t('REACTION_ADD')}
                  >
                    😀
                  </button>
                  {/* Edit (own messages only) */}
                  <Show when={isOwnMessage(msg)}>
                    <button
                      onClick={() => startEdit(msg)}
                      class="p-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      title={t('MESSAGE_EDIT')}
                    >
                      ✏️
                    </button>
                  </Show>
                  {/* Delete (own messages only) */}
                  <Show when={isOwnMessage(msg)}>
                    <button
                      onClick={() => setConfirmDelete(msg.id)}
                      class="p-1 text-xs text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                      title={t('MESSAGE_DELETE')}
                    >
                      🗑️
                    </button>
                  </Show>
                </div>

                {/* Emoji picker popup */}
                <Show when={showEmojiPicker() === msg.id}>
                  <div class="absolute right-2 top-8 bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] shadow-lg p-2 z-10">
                    <div class="grid grid-cols-4 gap-1">
                      <For each={COMMON_EMOJI}>
                        {(emoji) => (
                          <button
                            onClick={() => toggleReaction(msg.id, emoji)}
                            class="p-1 text-lg hover:bg-[var(--bg-input)] rounded transition-colors"
                          >
                            {emoji}
                          </button>
                        )}
                      </For>
                    </div>
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
      <Show when={store.activeChannelTypingUsers().length > 0}>
        <div class="px-4 py-1 text-xs text-[var(--text-muted)] italic">
          <Show when={store.activeChannelTypingUsers().length === 1}>
            {t('TYPING_SINGLE', { user: store.activeChannelTypingUsers()[0] })}
          </Show>
          <Show when={store.activeChannelTypingUsers().length > 1}>
            {t('TYPING_MULTIPLE', { count: store.activeChannelTypingUsers().length })}
          </Show>
        </div>
      </Show>

      {/* Message input */}
      <div class="px-4 pb-6 pt-2 shrink-0">
        {/* Upload progress */}
        <Show when={uploading()}>
          <div class="flex items-center gap-2 px-3 py-2 mb-2 bg-[var(--bg-input)] rounded-lg text-sm text-[var(--text-muted)]">
            <div class="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            <span>{uploadProgress() || t('FILE_UPLOAD_PROCESSING')}</span>
          </div>
        </Show>

        {/* Pending attachments */}
        <Show when={pendingAttachments().length > 0}>
          <div class="flex flex-wrap gap-2 px-3 py-2 mb-2 bg-[var(--bg-input)] rounded-lg border border-[var(--border)]">
            <For each={pendingAttachments()}>
              {(attachment) => (
                <div class="relative group">
                  <Show
                    when={isImageMimeType(attachment.mimeType)}
                    fallback={
                      <div class="flex items-center gap-1 px-2 py-1 bg-[var(--bg-surface)] rounded text-xs">
                        <span>{fileIcon(attachment.mimeType)}</span>
                        <span class="text-[var(--text-primary)] max-w-[120px] truncate">{attachment.filename}</span>
                        <span class="text-[var(--text-muted)]">{formatFileSize(attachment.size)}</span>
                      </div>
                    }
                  >
                    <img src={attachment.url} alt={attachment.filename} class="w-16 h-16 object-cover rounded" />
                  </Show>
                  <button
                    onClick={() => removePendingAttachment(attachment.id)}
                    class="absolute -top-1 -right-1 w-4 h-4 bg-[var(--error)] text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              )}
            </For>
            <div class="text-[10px] text-[var(--text-muted)] self-end">{t('FILE_UPLOAD_SIZE_LIMIT')}</div>
          </div>
        </Show>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          class="hidden"
          onChange={(e) => {
            if (e.currentTarget.files?.length) {
              handleFiles(e.currentTarget.files)
              e.currentTarget.value = ''
            }
          }}
        />
        <div class="flex items-end bg-[var(--bg-input)] rounded-lg border border-[var(--border)] focus-within:border-[var(--accent)] transition-colors">
          <button
            class="p-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"
            title={t('FILE_UPLOAD_BUTTON')}
            onClick={() => fileInputRef?.click()}
          >
            📎
          </button>
          <textarea
            value={inputContent()}
            onInput={(e) => {
              setInputContent(e.currentTarget.value)
              handleInputForTyping()
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            class="flex-1 py-3 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none text-sm"
            placeholder={t('MESSAGE_PLACEHOLDER', { channel: activeChannel()?.name ?? 'channel' })}
            style={{ 'max-height': '120px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!inputContent().trim() && pendingAttachments().length === 0}
            class="p-3 text-[var(--accent)] hover:text-[var(--accent-hover)] disabled:text-[var(--text-muted)] disabled:cursor-default shrink-0 transition-colors"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  )
}

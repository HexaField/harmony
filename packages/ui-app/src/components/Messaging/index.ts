// Messaging components
import { createSignal } from 'solid-js'
import type {
  MessageListProps,
  MessageItemProps,
  MessageInputProps,
  MessageEditorProps,
  ThreadViewProps,
  ReactionPickerProps,
  EmbedRendererProps,
  TypingIndicatorProps
} from '../../types.js'
import { t } from '../../i18n/strings.js'

export function MessageList(props: MessageListProps) {
  return { channelId: props.channelId, messages: props.messages, count: props.messages.length }
}

export function MessageItem(props: MessageItemProps) {
  return {
    message: props.message,
    onEdit: props.onEdit,
    onDelete: props.onDelete,
    onReply: props.onReply,
    onThread: props.onThread
  }
}

export function MessageInput(props: MessageInputProps) {
  const [content, setContent] = createSignal('')

  function send() {
    const text = content().trim()
    if (text) {
      props.onSend(text)
      setContent('')
    }
  }

  return {
    content: content(),
    setContent,
    send,
    placeholder: props.placeholder ?? t('MESSAGE_PLACEHOLDER', { channel: props.channelId })
  }
}

export function MessageEditor(props: MessageEditorProps) {
  const [content, setContent] = createSignal(props.message.content)
  return {
    content: content(),
    setContent,
    save: () => props.onSave(content()),
    cancel: props.onCancel
  }
}

export function ThreadView(props: ThreadViewProps) {
  return { parentMessage: props.parentMessage, replies: props.replies }
}

export function ReactionPicker(props: ReactionPickerProps) {
  const emojis = ['👍', '❤️', '😂', '🎉', '😢', '😡', '🤔', '👀']
  return { emojis, onSelect: props.onSelect }
}

export function EmbedRenderer(props: EmbedRendererProps) {
  return { url: props.url, title: props.title, description: props.description }
}

export function TypingIndicator(props: TypingIndicatorProps) {
  if (props.users.length === 0) return { text: '', visible: false }
  if (props.users.length === 1) return { text: t('TYPING_INDICATOR', { user: props.users[0] }), visible: true }
  return { text: t('TYPING_MANY', { count: props.users.length }), visible: true }
}

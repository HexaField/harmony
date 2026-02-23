// DM components
import { createSignal } from 'solid-js'
import type { DMListProps, DMConversationProps, DMComposeProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function DMList(props: DMListProps) {
  return {
    conversations: props.conversations,
    onSelect: props.onSelect,
    emptyMessage: t('DM_EMPTY')
  }
}

export function DMConversation(props: DMConversationProps) {
  return { conversationId: props.conversationId, messages: props.messages }
}

export function DMCompose(props: DMComposeProps) {
  const [recipient, setRecipient] = createSignal('')
  const [content, setContent] = createSignal('')

  function send() {
    const r = recipient().trim()
    const c = content().trim()
    if (r && c) {
      props.onSend(r, c)
      setContent('')
    }
  }

  return { recipient: recipient(), setRecipient, content: content(), setContent, send, label: t('DM_NEW') }
}

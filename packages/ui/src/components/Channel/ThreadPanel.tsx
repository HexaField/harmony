import { Show, For, type JSX } from 'solid-js'
import type { DecryptedMessage } from '@harmony/client'
import { Message } from './Message.js'
import { MessageComposer } from './MessageComposer.js'

export interface ThreadPanelProps {
  threadId: string
  parentMessage: DecryptedMessage
  messages: DecryptedMessage[]
  myDID: string
  onSend: (text: string) => void
  onClose: () => void
  loading?: boolean
}

export function ThreadPanel(props: ThreadPanelProps): JSX.Element {
  return (
    <div class="w-[400px] bg-hm-bg border-l border-hm-bg-darker flex flex-col h-full">
      {/* Header */}
      <div class="h-12 min-h-[48px] flex items-center justify-between px-4 border-b border-hm-bg-darker">
        <h3 class="text-white font-semibold text-sm">Thread</h3>
        <button class="text-hm-text-muted hover:text-white transition-colors" onClick={() => props.onClose()}>
          ✕
        </button>
      </div>

      {/* Parent message */}
      <div class="border-b border-hm-bg-darker py-2">
        <Message message={props.parentMessage} isOwn={props.parentMessage.authorDID === props.myDID} />
      </div>

      {/* Thread messages */}
      <div class="flex-1 overflow-y-auto py-2">
        <Show when={props.loading}>
          <div class="flex justify-center py-4">
            <span class="text-hm-text-muted text-sm">Loading...</span>
          </div>
        </Show>
        <For each={props.messages}>{(msg) => <Message message={msg} isOwn={msg.authorDID === props.myDID} />}</For>
        <Show when={props.messages.length === 0 && !props.loading}>
          <div class="flex items-center justify-center py-8">
            <p class="text-hm-text-muted text-sm">No replies yet</p>
          </div>
        </Show>
      </div>

      {/* Composer */}
      <MessageComposer onSend={props.onSend} onTyping={() => {}} />
    </div>
  )
}

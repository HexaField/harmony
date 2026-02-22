import { createSignal, type JSX } from 'solid-js'

export interface MessageComposerProps {
  onSend: (text: string) => void
  onTyping: () => void
  disabled?: boolean
}

// Logic hook (for testing)
export function useMessageComposer(props: MessageComposerProps) {
  const [text, setText] = createSignal('')

  return {
    text,
    setText,
    send() {
      const t = text().trim()
      if (t && !props.disabled) {
        props.onSend(t)
        setText('')
      }
    },
    handleInput(value: string) {
      setText(value)
      props.onTyping()
    }
  }
}

export function MessageComposer(props: MessageComposerProps): JSX.Element {
  const ctrl = useMessageComposer(props)

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    ctrl.send()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ctrl.send()
    }
  }

  return (
    <form class="px-4 pb-4" onSubmit={handleSubmit}>
      <div class="bg-hm-bg-dark rounded-lg flex items-center">
        <input
          type="text"
          class="flex-1 bg-transparent text-hm-text px-4 py-2.5 text-sm placeholder-hm-text-muted focus:outline-none disabled:opacity-50"
          placeholder={props.disabled ? 'Cannot send messages' : 'Send a message...'}
          value={ctrl.text()}
          onInput={(e) => ctrl.handleInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={props.disabled}
        />
        <button
          type="submit"
          class="px-3 py-2 text-hm-accent hover:text-hm-accent-hover disabled:text-hm-text-muted transition-colors"
          disabled={!ctrl.text().trim() || props.disabled}
        >
          ➤
        </button>
      </div>
    </form>
  )
}

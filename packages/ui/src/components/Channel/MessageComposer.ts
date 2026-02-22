import { createSignal } from 'solid-js'

export interface MessageComposerProps {
  onSend: (text: string) => void
  onTyping: () => void
  disabled?: boolean
}

export function MessageComposer(props: MessageComposerProps) {
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

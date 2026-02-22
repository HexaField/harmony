import { Show, type JSX } from 'solid-js'

export interface TypingIndicatorProps {
  typingUsers: string[]
}

// Logic hook (for testing)
export function useTypingIndicator(props: TypingIndicatorProps) {
  return {
    isTyping: () => props.typingUsers.length > 0,
    text: () => {
      const users = props.typingUsers
      if (users.length === 0) return ''
      if (users.length === 1) return `${users[0].slice(-8)} is typing...`
      if (users.length === 2) return `${users[0].slice(-8)} and ${users[1].slice(-8)} are typing...`
      return `${users.length} people are typing...`
    }
  }
}

export function TypingIndicator(props: TypingIndicatorProps): JSX.Element {
  const ctrl = useTypingIndicator(props)

  return (
    <Show when={ctrl.isTyping()}>
      <div class="px-4 py-1 text-xs text-hm-text-muted flex items-center gap-1.5">
        <span class="flex gap-0.5">
          <span class="w-1.5 h-1.5 bg-hm-text-muted rounded-full animate-bounce" style={{ 'animation-delay': '0ms' }} />
          <span
            class="w-1.5 h-1.5 bg-hm-text-muted rounded-full animate-bounce"
            style={{ 'animation-delay': '150ms' }}
          />
          <span
            class="w-1.5 h-1.5 bg-hm-text-muted rounded-full animate-bounce"
            style={{ 'animation-delay': '300ms' }}
          />
        </span>
        <span>{ctrl.text()}</span>
      </div>
    </Show>
  )
}

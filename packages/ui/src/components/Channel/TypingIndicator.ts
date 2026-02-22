export interface TypingIndicatorProps {
  typingUsers: string[]
}

export function TypingIndicator(props: TypingIndicatorProps) {
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

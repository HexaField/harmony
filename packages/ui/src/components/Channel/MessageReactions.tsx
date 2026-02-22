import { For, type JSX } from 'solid-js'

export interface MessageReactionsProps {
  reactions: Map<string, string[]>
  myDID: string
  onToggle: (emoji: string) => void
}

export function MessageReactions(props: MessageReactionsProps): JSX.Element {
  const reactionEntries = () => Array.from(props.reactions.entries())

  return (
    <div class="flex flex-wrap gap-1 mt-1">
      <For each={reactionEntries()}>
        {([emoji, dids]) => {
          const isMine = () => dids.includes(props.myDID)
          return (
            <button
              class={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition-colors ${
                isMine()
                  ? "bg-hm-accent/20 border-hm-accent text-hm-accent"
                  : "bg-hm-bg-dark border-hm-bg-darker text-hm-text-muted hover:border-hm-text-muted"
              }`}
              onClick={() => props.onToggle(emoji)}
            >
              <span>{emoji}</span>
              <span>{dids.length}</span>
            </button>
          )
        }}
      </For>
    </div>
  )
}

import { createSignal, Show, type JSX } from 'solid-js'

export interface LinkDiscordViewProps {
  onLink: (token: string) => void
  onSkip: () => void
  linked?: boolean
  discordUsername?: string
}

export function LinkDiscordView(props: LinkDiscordViewProps): JSX.Element {
  const [loading, setLoading] = createSignal(false)

  const initiateOAuth = () => {
    setLoading(true)
    // In a real implementation, this would redirect to Discord OAuth
    // For now, simulate with a token
    setTimeout(() => {
      props.onLink('discord-oauth-token')
      setLoading(false)
    }, 1000)
  }

  return (
    <div class="flex items-center justify-center min-h-screen bg-hm-bg-darkest">
      <div class="bg-hm-bg rounded-lg shadow-xl p-8 w-full max-w-md">
        <h2 class="text-xl font-bold text-white mb-2">Link Discord Account</h2>
        <p class="text-hm-text-muted text-sm mb-6">
          Optionally link your Discord account to verify your identity and import your profile.
        </p>

        <Show
          when={!props.linked}
          fallback={
            <div class="bg-hm-bg-dark rounded-md p-4 mb-4 flex items-center gap-3">
              <span class="text-2xl">🎮</span>
              <div>
                <p class="text-white font-medium">{props.discordUsername}</p>
                <p class="text-hm-green text-sm">✓ Linked</p>
              </div>
            </div>
          }
        >
          <button
            class="w-full py-3 bg-[#5865F2] hover:bg-[#4752c4] text-white rounded-md font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            disabled={loading()}
            onClick={initiateOAuth}
          >
            {loading() ? 'Connecting...' : '🎮 Link Discord Account'}
          </button>
        </Show>

        <button
          class="w-full mt-3 py-2.5 bg-hm-bg-dark hover:bg-hm-bg-darker text-hm-text-muted rounded-md text-sm transition-colors"
          onClick={() => props.onSkip()}
        >
          {props.linked ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </div>
  )
}

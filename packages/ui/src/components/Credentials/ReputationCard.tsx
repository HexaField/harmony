import { Show, type JSX } from 'solid-js'
import type { ReputationProfile } from '@harmony/credentials'

export interface ReputationCardProps {
  reputation: ReputationProfile
  compact?: boolean
}

export function useReputationCard(props: ReputationCardProps) {
  const scoreColor = () => {
    const s = props.reputation.aggregateScore
    if (s >= 80) return 'text-green-400'
    if (s >= 50) return 'text-yellow-400'
    if (s >= 20) return 'text-orange-400'
    return 'text-red-400'
  }

  const scoreLabel = () => {
    const s = props.reputation.aggregateScore
    if (s >= 80) return 'Excellent'
    if (s >= 50) return 'Good'
    if (s >= 20) return 'Fair'
    return 'New'
  }

  return {
    did: () => props.reputation.did,
    score: () => props.reputation.aggregateScore,
    scoreColor,
    scoreLabel,
    communityCount: () => props.reputation.communities.length,
    credentialCount: () => props.reputation.credentials.length,
    lastUpdated: () => {
      try {
        return new Date(props.reputation.lastUpdated).toLocaleDateString()
      } catch {
        return ''
      }
    },
    compact: () => props.compact ?? false
  }
}

export function ReputationCard(props: ReputationCardProps): JSX.Element {
  const ctrl = useReputationCard(props)

  return (
    <Show
      when={!ctrl.compact()}
      fallback={
        <div class="flex items-center gap-2">
          <span class={`text-sm font-bold ${ctrl.scoreColor()}`}>{ctrl.score()}</span>
          <span class="text-xs text-hm-text-muted">{ctrl.scoreLabel()}</span>
        </div>
      }
    >
      <div class="bg-hm-bg-dark rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs text-hm-text-muted">Reputation</span>
          <span class="text-xs text-hm-text-muted">{ctrl.lastUpdated()}</span>
        </div>

        <div class="flex items-center gap-4 mb-3">
          <div class="relative w-16 h-16">
            <svg class="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                class="text-hm-bg-darker"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-dasharray={`${ctrl.score()}, 100`}
                class={ctrl.scoreColor()}
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class={`text-lg font-bold ${ctrl.scoreColor()}`}>{ctrl.score()}</span>
            </div>
          </div>

          <div>
            <p class={`text-sm font-semibold ${ctrl.scoreColor()}`}>{ctrl.scoreLabel()}</p>
            <p class="text-xs text-hm-text-muted mt-1">
              {ctrl.communityCount()} communit{ctrl.communityCount() !== 1 ? 'ies' : 'y'}
            </p>
            <p class="text-xs text-hm-text-muted">
              {ctrl.credentialCount()} credential{ctrl.credentialCount() !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>
    </Show>
  )
}

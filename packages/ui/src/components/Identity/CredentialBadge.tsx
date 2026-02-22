import type { JSX } from 'solid-js'

export interface CredentialBadgeProps {
  type: string
  issuer: string
  verified?: boolean
}

const BADGE_ICONS: Record<string, string> = {
  DiscordIdentityCredential: '🎮',
  GitHubIdentityCredential: '🐙',
  EmailCredential: '✉️',
  PhoneCredential: '📱'
}

const BADGE_COLORS: Record<string, string> = {
  DiscordIdentityCredential: 'bg-[#5865F2]/20 text-[#5865F2]',
  GitHubIdentityCredential: 'bg-white/10 text-white',
  EmailCredential: 'bg-hm-green/20 text-hm-green',
  PhoneCredential: 'bg-hm-yellow/20 text-hm-yellow'
}

export function CredentialBadge(props: CredentialBadgeProps): JSX.Element {
  const icon = () => BADGE_ICONS[props.type] ?? '🏷️'
  const colorClass = () => BADGE_COLORS[props.type] ?? 'bg-hm-text-muted/20 text-hm-text-muted'
  const label = () => props.type.replace(/Credential$/, '').replace(/Identity$/, '')

  return (
    <span
      class={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass()}`}
      title={`Issued by ${props.issuer}`}
    >
      <span>{icon()}</span>
      <span>{label()}</span>
      {props.verified !== false && <span class="text-hm-green">✓</span>}
    </span>
  )
}

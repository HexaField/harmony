// Voice components
import type { VoiceChannelProps, VoiceControlsProps, VoiceParticipantProps, VoicePipProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function VoiceChannel(props: VoiceChannelProps) {
  return { channelId: props.channelId, participants: props.participants, count: props.participants.length }
}

export function VoiceControls(props: VoiceControlsProps) {
  return {
    muted: props.muted,
    deafened: props.deafened,
    videoOn: props.videoOn,
    onToggleMute: props.onToggleMute,
    onToggleDeafen: props.onToggleDeafen,
    onToggleVideo: props.onToggleVideo,
    onLeave: props.onLeave,
    muteLabel: props.muted ? t('VOICE_UNMUTE') : t('VOICE_MUTE')
  }
}

export function VoiceParticipant(props: VoiceParticipantProps) {
  return { ...props.participant }
}

export function VoicePip(props: VoicePipProps) {
  return { channelName: props.channelName, participants: props.participants }
}

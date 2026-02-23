// Shell components — AppRoot, Onboarding, CommunityLayout, ChannelSidebar, ServerList, TitleBar
import { createSignal } from 'solid-js'
import type {
  AppRootProps,
  OnboardingProps,
  CommunityLayoutProps,
  ChannelSidebarProps,
  ServerListProps,
  TitleBarProps
} from '../../types.js'
import { t } from '../../i18n/strings.js'

export function AppRoot(props: AppRootProps) {
  return props.children
}

export function Onboarding(props: OnboardingProps) {
  const [step, setStep] = createSignal<'welcome' | 'create' | 'recover'>('welcome')
  const [mnemonic, setMnemonic] = createSignal('')

  return {
    step: step(),
    setStep,
    mnemonic: mnemonic(),
    setMnemonic,
    title: t('ONBOARDING_WELCOME'),
    createLabel: t('ONBOARDING_CREATE_IDENTITY'),
    recoverLabel: t('ONBOARDING_RECOVER_IDENTITY'),
    importLabel: t('ONBOARDING_IMPORT_DISCORD'),
    onComplete: props.onComplete
  }
}

export function CommunityLayout(props: CommunityLayoutProps) {
  return { communityId: props.communityId, children: props.children }
}

export function ChannelSidebar(props: ChannelSidebarProps) {
  return {
    communityId: props.communityId,
    channels: props.channels,
    activeChannelId: props.activeChannelId,
    onSelect: props.onSelect
  }
}

export function ServerList(props: ServerListProps) {
  return {
    communities: props.communities,
    activeCommunityId: props.activeCommunityId,
    onSelect: props.onSelect
  }
}

export function TitleBar(props: TitleBarProps) {
  return {
    communityName: props.communityName ?? '',
    userName: props.userName ?? ''
  }
}

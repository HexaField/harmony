// Bot components
import type { BotStoreProps, BotSettingsProps, BotDashboardProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function BotStore(props: BotStoreProps) {
  return { bots: props.bots, title: t('BOT_STORE') }
}

export function BotSettings(props: BotSettingsProps) {
  return { botId: props.botId, title: t('BOT_SETTINGS') }
}

export function BotDashboard(props: BotDashboardProps) {
  return { bots: props.bots, title: t('BOT_DASHBOARD') }
}

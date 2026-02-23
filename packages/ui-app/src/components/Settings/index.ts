// Settings components
import type {
  UserSettingsProps,
  IdentitySettingsProps,
  DeviceSettingsProps,
  RecoverySettingsProps,
  AppearanceSettingsProps,
  NotificationSettingsProps,
  NodeSettingsProps
} from '../../types.js'
import { t } from '../../i18n/strings.js'

export function UserSettings(_props: UserSettingsProps) {
  return { title: t('SETTINGS_USER') }
}

export function IdentitySettings(props: IdentitySettingsProps) {
  return { did: props.did, title: t('SETTINGS_IDENTITY') }
}

export function DeviceSettings(props: DeviceSettingsProps) {
  return { devices: props.devices, title: t('SETTINGS_DEVICES') }
}

export function RecoverySettings(_props: RecoverySettingsProps) {
  return { title: t('SETTINGS_RECOVERY') }
}

export function AppearanceSettings(props: AppearanceSettingsProps) {
  return {
    theme: props.theme,
    onThemeChange: props.onThemeChange,
    title: t('SETTINGS_APPEARANCE'),
    darkLabel: t('SETTINGS_THEME_DARK'),
    lightLabel: t('SETTINGS_THEME_LIGHT')
  }
}

export function NotificationSettings(_props: NotificationSettingsProps) {
  return { title: t('SETTINGS_NOTIFICATIONS') }
}

export function NodeSettings(_props: NodeSettingsProps) {
  return { title: t('SETTINGS_NODE') }
}

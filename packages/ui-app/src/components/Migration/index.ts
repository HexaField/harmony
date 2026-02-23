// Migration components
import { createSignal } from 'solid-js'
import type { MigrationWizardProps, MigrationProgressProps, MigrationCompleteProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function MigrationWizard(props: MigrationWizardProps) {
  const [step, setStep] = createSignal<'token' | 'select' | 'export' | 'complete'>('token')
  const [token, setToken] = createSignal('')

  return {
    step: step(),
    setStep,
    token: token(),
    setToken,
    onComplete: props.onComplete,
    title: t('MIGRATION_TITLE'),
    tokenLabel: t('MIGRATION_STEP_TOKEN'),
    selectLabel: t('MIGRATION_STEP_SELECT'),
    exportLabel: t('MIGRATION_STEP_EXPORT'),
    completeLabel: t('MIGRATION_STEP_COMPLETE'),
    cancelLabel: t('MIGRATION_CANCEL')
  }
}

export function MigrationProgress(props: MigrationProgressProps) {
  const percent = props.total > 0 ? Math.round((props.current / props.total) * 100) : 0
  return {
    phase: props.phase,
    current: props.current,
    total: props.total,
    percent,
    channelName: props.channelName
  }
}

export function MigrationComplete(props: MigrationCompleteProps) {
  return { summary: props.summary, title: t('MIGRATION_STEP_COMPLETE') }
}

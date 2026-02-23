// Credentials components
import type { CredentialPortfolioProps, CredentialDetailProps, CredentialIssueProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function CredentialPortfolio(props: CredentialPortfolioProps) {
  return { credentials: props.credentials, title: t('CREDENTIAL_PORTFOLIO') }
}

export function CredentialDetail(props: CredentialDetailProps) {
  return { credential: props.credential, title: t('CREDENTIAL_DETAIL') }
}

export function CredentialIssue(props: CredentialIssueProps) {
  return { onIssue: props.onIssue, title: t('CREDENTIAL_ISSUE') }
}

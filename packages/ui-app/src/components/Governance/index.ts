// Governance components
import { createSignal } from 'solid-js'
import type { ProposalListProps, ProposalDetailProps, ProposalCreateProps, ConstitutionViewProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function ProposalList(props: ProposalListProps) {
  return { proposals: props.proposals, title: t('COMMUNITY_GOVERNANCE') }
}

export function ProposalDetail(props: ProposalDetailProps) {
  return { proposal: props.proposal, voteLabel: t('PROPOSAL_VOTE'), tallyLabel: t('PROPOSAL_TALLY') }
}

export function ProposalCreate(props: ProposalCreateProps) {
  const [title, setTitle] = createSignal('')
  const [description, setDescription] = createSignal('')

  function submit() {
    props.onSubmit({ title: title(), description: description(), options: ['yes', 'no'] })
  }

  return {
    communityId: props.communityId,
    title: title(),
    setTitle,
    description: description(),
    setDescription,
    submit,
    label: t('PROPOSAL_CREATE')
  }
}

export function ConstitutionView(props: ConstitutionViewProps) {
  return { communityId: props.communityId }
}

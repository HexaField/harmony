// Community management components
import type {
  CommunitySettingsFormProps,
  RoleManagerProps,
  MemberManagerProps,
  InviteManagerProps,
  AuditLogProps
} from '../../types.js'
import { t } from '../../i18n/strings.js'

export function CommunitySettingsForm(props: CommunitySettingsFormProps) {
  return { communityId: props.communityId, title: t('COMMUNITY_SETTINGS') }
}

export function RoleManager(props: RoleManagerProps) {
  return { communityId: props.communityId, roles: props.roles, title: t('COMMUNITY_ROLES') }
}

export function MemberManager(props: MemberManagerProps) {
  return { communityId: props.communityId, members: props.members, title: t('COMMUNITY_MEMBERS') }
}

export function InviteManager(props: InviteManagerProps) {
  return { communityId: props.communityId, copyLabel: t('COPY_LINK') }
}

export function AuditLog(props: AuditLogProps) {
  return { communityId: props.communityId, entries: props.entries }
}

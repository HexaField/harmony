// @harmony/ui — SolidJS Chat Interface

export { App, useApp } from './App.js'

// Stores
export { createAuthStore } from './stores/auth.js'
export type { AuthStore } from './stores/auth.js'
export { createCommunityStore } from './stores/community.js'
export type { CommunityStore } from './stores/community.js'
export { createChannelStore } from './stores/channel.js'
export type { ChannelStore } from './stores/channel.js'
export { createDMStore } from './stores/dm.js'
export type { DMStore } from './stores/dm.js'
export { createPresenceStore } from './stores/presence.js'
export type { PresenceStore } from './stores/presence.js'

// Hooks
export { useClient } from './hooks/useClient.js'
export { useChannel } from './hooks/useChannel.js'
export { usePresence } from './hooks/usePresence.js'

// Auth components
export { LoginView, useLoginView } from './components/Auth/LoginView.js'
export { MnemonicBackupView } from './components/Auth/MnemonicBackupView.js'
export { LinkDiscordView } from './components/Auth/LinkDiscordView.js'

// Community components
export { CommunityList, useCommunityList } from './components/Community/CommunityList.js'
export { CommunityHeader, useCommunityHeader } from './components/Community/CommunityHeader.js'
export { MemberList, useMemberList } from './components/Community/MemberList.js'
export { CommunitySettings } from './components/Community/CommunitySettings.js'
export { CreateCommunityDialog } from './components/Community/CreateCommunityDialog.js'
export { JoinCommunityDialog } from './components/Community/JoinCommunityDialog.js'

// Channel components
export { ChannelList, useChannelList } from './components/Channel/ChannelList.js'
export { ChannelHeader } from './components/Channel/ChannelHeader.js'
export { MessageList, useMessageList } from './components/Channel/MessageList.js'
export { MessageComposer, useMessageComposer } from './components/Channel/MessageComposer.js'
export { Message, useMessage } from './components/Channel/Message.js'
export { MessageReactions } from './components/Channel/MessageReactions.js'
export { MessageContextMenu } from './components/Channel/MessageContextMenu.js'
export { ThreadPanel } from './components/Channel/ThreadPanel.js'
export { TypingIndicator, useTypingIndicator } from './components/Channel/TypingIndicator.js'

// DM components
export { DMList, useDMList } from './components/DM/DMList.js'

// Identity components
export { ProfileView } from './components/Identity/ProfileView.js'
export { UserCard } from './components/Identity/UserCard.js'
export { CredentialBadge } from './components/Identity/CredentialBadge.js'

// Migration components
export { ImportWizard } from './components/Migration/ImportWizard.js'
export { ExportView } from './components/Migration/ExportView.js'

// Settings components
export { AppSettings } from './components/Settings/AppSettings.js'
export { KeyManagement } from './components/Settings/KeyManagement.js'

// Shared components
export { Avatar, useAvatar } from './components/Shared/Avatar.js'
export { Tooltip } from './components/Shared/Tooltip.js'
export { Modal } from './components/Shared/Modal.js'
export { ContextMenu } from './components/Shared/ContextMenu.js'
export { Toast, addToast, removeToast } from './components/Shared/Toast.js'
export { VirtualScroller } from './components/Shared/VirtualScroller.js'

// Voice components
export { VoiceChannel, useVoiceChannel } from './components/Voice/VoiceChannel.js'
export { VoiceControls, useVoiceControls } from './components/Voice/VoiceControls.js'
export { VoiceParticipantGrid, useVoiceParticipantGrid } from './components/Voice/VoiceParticipantGrid.js'
export { VoicePip, useVoicePip } from './components/Voice/VoicePip.js'

// Media components
export { FileUpload, useFileUpload } from './components/Media/FileUpload.js'
export { FilePreview, useFilePreview } from './components/Media/FilePreview.js'
export { LinkPreview, useLinkPreview } from './components/Media/LinkPreview.js'
export { ImageGallery, useImageGallery } from './components/Media/ImageGallery.js'

// Search components
export { SearchBar, useSearchBar } from './components/Search/SearchBar.js'
export { SearchResults, useSearchResults } from './components/Search/SearchResults.js'
export { SearchFilters, useSearchFilters } from './components/Search/SearchFilters.js'

// Bot components
export { BotDirectory, useBotDirectory } from './components/Bot/BotDirectory.js'
export { BotInstall, useBotInstall } from './components/Bot/BotInstall.js'
export { BotSettings, useBotSettings } from './components/Bot/BotSettings.js'
export { WebhookManager, useWebhookManager } from './components/Bot/WebhookManager.js'

// Governance components
export { ProposalList, useProposalList } from './components/Governance/ProposalList.js'
export { ProposalDetail, useProposalDetail } from './components/Governance/ProposalDetail.js'
export { CreateProposal, useCreateProposal } from './components/Governance/CreateProposal.js'
export { ConstitutionView, useConstitutionView } from './components/Governance/ConstitutionView.js'
export { DelegationManager, useDelegationManager } from './components/Governance/DelegationManager.js'

// Credentials components
export { CredentialPortfolio, useCredentialPortfolio } from './components/Credentials/CredentialPortfolio.js'
export { CredentialDetail, useCredentialDetail } from './components/Credentials/CredentialDetail.js'
export { CredentialTypeEditor, useCredentialTypeEditor } from './components/Credentials/CredentialTypeEditor.js'
export { ReputationCard, useReputationCard } from './components/Credentials/ReputationCard.js'
export { IssueCredential, useIssueCredential } from './components/Credentials/IssueCredential.js'

// Notification components
export { NotificationCenter, useNotificationCenter } from './components/Notifications/NotificationCenter.js'
export { NotificationItem, useNotificationItem } from './components/Notifications/NotificationItem.js'
export { NotificationSettings, useNotificationSettings } from './components/Notifications/NotificationSettings.js'

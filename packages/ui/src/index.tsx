// @harmony/ui — SolidJS Chat Interface
// Scaffold: core component structure with types and store bindings

export { App } from './App.js'

// Stores
export { AuthStore, createAuthStore } from './stores/auth.js'
export { CommunityStore, createCommunityStore } from './stores/community.js'
export { ChannelStore, createChannelStore } from './stores/channel.js'

// Hooks
export { useClient } from './hooks/useClient.js'

// Component exports
export { LoginView } from './components/Auth/LoginView.js'
export { CommunityList } from './components/Community/CommunityList.js'
export { CommunityHeader } from './components/Community/CommunityHeader.js'
export { MemberList } from './components/Community/MemberList.js'
export { ChannelList } from './components/Channel/ChannelList.js'
export { MessageList } from './components/Channel/MessageList.js'
export { MessageComposer } from './components/Channel/MessageComposer.js'
export { Message } from './components/Channel/Message.js'
export { TypingIndicator } from './components/Channel/TypingIndicator.js'
export { DMList } from './components/DM/DMList.js'
export { Avatar } from './components/Shared/Avatar.js'

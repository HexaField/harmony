import { createSignal, Show, createMemo, type JSX } from 'solid-js'
import type { CommunityState, ChannelInfo, DecryptedMessage, MemberInfo, DMChannelState } from '@harmony/client'
import { CommunityList } from './components/Community/CommunityList.js'
import { CommunityHeader } from './components/Community/CommunityHeader.js'
import { ChannelList } from './components/Channel/ChannelList.js'
import { ChannelHeader } from './components/Channel/ChannelHeader.js'
import { MessageList } from './components/Channel/MessageList.js'
import { MessageComposer } from './components/Channel/MessageComposer.js'
import { Message } from './components/Channel/Message.js'
import { TypingIndicator } from './components/Channel/TypingIndicator.js'
import { MemberList } from './components/Community/MemberList.js'
import { DMList } from './components/DM/DMList.js'
import { LoginView } from './components/Auth/LoginView.js'
import { Toast } from './components/Shared/Toast.js'

// Logic hook (for testing)
export function useApp() {
  const [view, setView] = createSignal<'login' | 'chat'>('login')
  return { view, setView }
}

export function App(): JSX.Element {
  const ctrl = useApp()

  // App state
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [communities, _setCommunities] = createSignal<CommunityState[]>([])
  const [activeCommunityId, setActiveCommunityId] = createSignal<string | null>(null)
  const [activeChannelId, setActiveChannelId] = createSignal<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [messages, _setMessages] = createSignal<DecryptedMessage[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [typingUsers, _setTypingUsers] = createSignal<string[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [dmChannels, _setDmChannels] = createSignal<DMChannelState[]>([])
  const [activeRecipientDID, setActiveRecipientDID] = createSignal<string | null>(null)

  const activeCommunity = createMemo(() => communities().find((c) => c.id === activeCommunityId()) ?? null)
  const activeChannel = createMemo(
    (): ChannelInfo | null => activeCommunity()?.channels.find((ch) => ch.id === activeChannelId()) ?? null
  )
  const members = createMemo((): MemberInfo[] => activeCommunity()?.members ?? [])

  return (
    <div class="h-screen flex flex-col bg-hm-bg-darkest text-hm-text">
      <Show
        when={ctrl.view() === 'chat'}
        fallback={<LoginView onLogin={(_mnemonic) => ctrl.setView('chat')} onCreate={() => ctrl.setView('chat')} />}
      >
        <div class="flex flex-1 overflow-hidden">
          {/* Community sidebar */}
          <div class="w-[72px] bg-hm-bg-darkest flex flex-col items-center border-r border-hm-bg-darker">
            <CommunityList
              communities={communities()}
              activeCommunityId={activeCommunityId()}
              onSelect={setActiveCommunityId}
            />
            <div class="mt-auto pb-3">
              <button class="w-12 h-12 rounded-full bg-hm-bg-dark text-hm-green text-2xl hover:bg-hm-green hover:text-white hover:rounded-2xl transition-all">
                +
              </button>
            </div>
          </div>

          {/* Channel sidebar */}
          <div class="w-60 bg-hm-bg-dark flex flex-col">
            <CommunityHeader community={activeCommunity()} />
            <div class="flex-1 overflow-y-auto px-2">
              <ChannelList
                channels={activeCommunity()?.channels ?? []}
                activeChannelId={activeChannelId()}
                onSelect={setActiveChannelId}
              />
              <DMList
                channels={dmChannels()}
                activeRecipientDID={activeRecipientDID()}
                onSelect={setActiveRecipientDID}
              />
            </div>
          </div>

          {/* Main chat area */}
          <div class="flex-1 flex flex-col bg-hm-bg">
            <ChannelHeader channel={activeChannel()} />
            <MessageList
              messages={messages()}
              loading={false}
              hasMore={false}
              onLoadMore={() => {}}
              renderMessage={(msg) => <Message message={msg} isOwn={false} onReply={() => {}} onReact={() => {}} />}
            />
            <TypingIndicator typingUsers={typingUsers()} />
            <MessageComposer onSend={(_text) => {}} onTyping={() => {}} disabled={!activeChannelId()} />
          </div>

          {/* Member list */}
          <Show when={activeCommunity()}>
            <MemberList members={members()} />
          </Show>
        </div>
      </Show>
      <Toast />
    </div>
  )
}

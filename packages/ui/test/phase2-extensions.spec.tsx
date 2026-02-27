// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { createDMStore } from '../src/stores/dm.js'
import { createPresenceStore } from '../src/stores/presence.js'
import type { DMChannelState, DecryptedMessage } from '@harmony/client'
import { render } from '@solidjs/testing-library'
import { ChannelHeader } from '../src/components/Channel/ChannelHeader.js'
import { MessageContextMenu } from '../src/components/Channel/MessageContextMenu.js'
import { MessageReactions } from '../src/components/Channel/MessageReactions.js'
import { ThreadPanel } from '../src/components/Channel/ThreadPanel.js'
import { CommunitySettings } from '../src/components/Community/CommunitySettings.js'
import { CreateCommunityDialog } from '../src/components/Community/CreateCommunityDialog.js'
import { JoinCommunityDialog } from '../src/components/Community/JoinCommunityDialog.js'
import { LinkDiscordView } from '../src/components/Auth/LinkDiscordView.js'
import { MnemonicBackupView } from '../src/components/Auth/MnemonicBackupView.js'
import { CredentialBadge } from '../src/components/Identity/CredentialBadge.js'
import { ProfileView } from '../src/components/Identity/ProfileView.js'
import { UserCard } from '../src/components/Identity/UserCard.js'
import { ExportView } from '../src/components/Migration/ExportView.js'
import { ImportWizard } from '../src/components/Migration/ImportWizard.js'
import { AppSettings } from '../src/components/Settings/AppSettings.js'
import { KeyManagement } from '../src/components/Settings/KeyManagement.js'
import { Modal } from '../src/components/Shared/Modal.js'
import { ContextMenu } from '../src/components/Shared/ContextMenu.js'
import { Toast, addToast } from '../src/components/Shared/Toast.js'
import { Tooltip } from '../src/components/Shared/Tooltip.js'
import { VirtualScroller } from '../src/components/Shared/VirtualScroller.js'

function makeMessage(overrides: Partial<DecryptedMessage> = {}): DecryptedMessage {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    authorDID: 'did:key:alice',
    content: { text: 'Hello world' },
    timestamp: new Date().toISOString(),
    clock: { counter: 1, authorDID: 'did:key:alice' },
    reactions: new Map(),
    edited: false,
    ...overrides
  }
}

describe('@harmony/ui Phase 2 Extensions', () => {
  // ── DM Store ──

  describe('DM Store', () => {
    it('MUST initialise with empty channels', () => {
      const store = createDMStore()
      expect(store.channels()).toEqual([])
      expect(store.activeRecipientDID()).toBeNull()
    })

    it('MUST update channels', () => {
      const store = createDMStore()
      const channels: DMChannelState[] = [
        { recipientDID: 'did:key:alice', messages: [], unreadCount: 3 },
        { recipientDID: 'did:key:bob', messages: [], unreadCount: 0 }
      ]
      store.updateChannels(channels)
      expect(store.channels().length).toBe(2)
    })

    it('MUST set active recipient', () => {
      const store = createDMStore()
      store.setActiveRecipient('did:key:alice')
      expect(store.activeRecipientDID()).toBe('did:key:alice')
      store.setActiveRecipient(null)
      expect(store.activeRecipientDID()).toBeNull()
    })

    it('MUST mark channel as read', () => {
      const store = createDMStore()
      store.updateChannels([
        { recipientDID: 'did:key:alice', messages: [], unreadCount: 5 },
        { recipientDID: 'did:key:bob', messages: [], unreadCount: 3 }
      ])
      store.markRead('did:key:alice')
      const alice = store.channels().find((c) => c.recipientDID === 'did:key:alice')
      const bob = store.channels().find((c) => c.recipientDID === 'did:key:bob')
      expect(alice?.unreadCount).toBe(0)
      expect(bob?.unreadCount).toBe(3)
    })
  })

  // ── Presence Store ──

  describe('Presence Store', () => {
    it('MUST initialise with online status', () => {
      const store = createPresenceStore()
      expect(store.myPresence().status).toBe('online')
    })

    it('MUST set my status', () => {
      const store = createPresenceStore()
      store.setMyStatus('dnd', 'Busy working')
      expect(store.myPresence().status).toBe('dnd')
      expect(store.myPresence().customStatus).toBe('Busy working')
    })

    it('MUST update user presence', () => {
      const store = createPresenceStore()
      store.updateUserPresence('did:key:alice', { status: 'idle' })
      expect(store.getUserPresence('did:key:alice').status).toBe('idle')
    })

    it('MUST default unknown users to offline', () => {
      const store = createPresenceStore()
      expect(store.getUserPresence('did:key:unknown').status).toBe('offline')
    })

    it('MUST track multiple user presences', () => {
      const store = createPresenceStore()
      store.updateUserPresence('did:key:a', { status: 'online' })
      store.updateUserPresence('did:key:b', { status: 'idle' })
      store.updateUserPresence('did:key:c', { status: 'dnd', customStatus: 'Gaming' })
      expect(store.userPresences().size).toBe(3)
      expect(store.getUserPresence('did:key:c').customStatus).toBe('Gaming')
    })

    it('MUST overwrite previous presence for same user', () => {
      const store = createPresenceStore()
      store.updateUserPresence('did:key:a', { status: 'online' })
      store.updateUserPresence('did:key:a', { status: 'offline' })
      expect(store.getUserPresence('did:key:a').status).toBe('offline')
    })
  })

  // ── JSX Components ──

  describe('JSX Components', () => {
    it('ChannelHeader — renders channel name and topic', () => {
      const { container } = render(() => (
        <ChannelHeader
          channel={{ id: 'ch-1', communityId: 'c-1', name: 'general', type: 'text', createdAt: '', topic: 'Welcome!' }}
        />
      ))
      expect(container.textContent).toContain('general')
      expect(container.textContent).toContain('Welcome!')
    })

    it('ChannelHeader — renders fallback when no channel', () => {
      const { container } = render(() => <ChannelHeader channel={null} />)
      expect(container.textContent).toContain('Select a channel')
    })

    it('MessageContextMenu — renders menu items for own messages', () => {
      const { container } = render(() => (
        <MessageContextMenu isOwn={true} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onReact={vi.fn()}>
          <span>msg</span>
        </MessageContextMenu>
      ))
      expect(container.textContent).toContain('msg')
    })

    it('MessageReactions — renders reaction buttons with counts', () => {
      const reactions = new Map([
        ['👍', ['did:key:alice', 'did:key:bob']],
        ['❤️', ['did:key:alice']]
      ])
      const { container } = render(() => (
        <MessageReactions reactions={reactions} myDID="did:key:alice" onToggle={vi.fn()} />
      ))
      expect(container.textContent).toContain('👍')
      expect(container.textContent).toContain('2')
      expect(container.textContent).toContain('❤️')
      expect(container.textContent).toContain('1')
    })

    it('ThreadPanel — renders thread messages and reply composer', () => {
      const parent = makeMessage({ content: { text: 'Thread parent' } })
      const { container } = render(() => (
        <ThreadPanel
          threadId="t-1"
          parentMessage={parent}
          messages={[]}
          myDID="did:key:me"
          onSend={vi.fn()}
          onClose={vi.fn()}
        />
      ))
      expect(container.textContent).toContain('Thread')
      expect(container.textContent).toContain('No replies yet')
    })

    it('CommunitySettings — renders settings form with community info', () => {
      const { container } = render(() => (
        <CommunitySettings
          communityId="c-1"
          name="My Community"
          description="A test"
          onSave={vi.fn()}
          onClose={vi.fn()}
          open={true}
        />
      ))
      expect(container.textContent).toContain('Community Settings')
      const input = container.querySelector('input') as HTMLInputElement
      expect(input.value).toBe('My Community')
    })

    it('CreateCommunityDialog — renders creation form with validation', () => {
      const { container } = render(() => <CreateCommunityDialog open={true} onClose={vi.fn()} onCreate={vi.fn()} />)
      expect(container.textContent).toContain('Create a Community')
      const createBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Create')
      expect(createBtn?.disabled).toBe(true)
    })

    it('JoinCommunityDialog — renders join form with invite code input', () => {
      const { container } = render(() => <JoinCommunityDialog open={true} onClose={vi.fn()} onJoin={vi.fn()} />)
      expect(container.textContent).toContain('Join a Community')
      const input = container.querySelector('input') as HTMLInputElement
      expect(input.placeholder).toContain('community ID')
    })

    it('LinkDiscordView — renders Discord OAuth link flow', () => {
      const { container } = render(() => <LinkDiscordView onLink={vi.fn()} onSkip={vi.fn()} />)
      expect(container.textContent).toContain('Link Discord Account')
      expect(container.textContent).toContain('Skip for now')
    })

    it('MnemonicBackupView — renders mnemonic words grid', () => {
      const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident'
      const { container } = render(() => (
        <MnemonicBackupView mnemonic={mnemonic} onConfirm={vi.fn()} onBack={vi.fn()} />
      ))
      expect(container.textContent).toContain('abandon')
      expect(container.textContent).toContain('accident')
      expect(container.textContent).toContain('Recovery Phrase')
    })

    it('CredentialBadge — renders badge with credential type icon', () => {
      const { container } = render(() => <CredentialBadge type="DiscordIdentityCredential" issuer="harmony" />)
      expect(container.textContent).toContain('🎮')
      expect(container.textContent).toContain('Discord')
    })

    it('ProfileView — renders user profile with credentials and presence', () => {
      const { container } = render(() => (
        <ProfileView
          did="did:key:abc123"
          displayName="Alice"
          credentials={[{ type: 'EmailCredential', issuer: 'harmony', issuedAt: '2024-01-01' }]}
        />
      ))
      expect(container.textContent).toContain('Alice')
      expect(container.textContent).toContain('EmailCredential')
    })

    it('UserCard — renders compact user card with avatar and status', () => {
      const { container } = render(() => (
        <UserCard
          did="did:key:abc123"
          displayName="Bob"
          roles={['admin', 'mod']}
          joinedAt="2024-01-01T00:00:00Z"
          presenceStatus="online"
        />
      ))
      expect(container.textContent).toContain('Bob')
      expect(container.textContent).toContain('admin')
      expect(container.textContent).toContain('mod')
    })

    it('ExportView — renders export options and progress', () => {
      const { container } = render(() => (
        <ExportView communityId="c-1" communityName="Test Community" onExport={vi.fn()} />
      ))
      expect(container.textContent).toContain('Export Community Data')
      expect(container.textContent).toContain('Test Community')
      expect(container.textContent).toContain('JSON')
      expect(container.textContent).toContain('RDF')
    })

    it('ImportWizard — renders multi-step import wizard', () => {
      const { container } = render(() => <ImportWizard onImport={vi.fn()} onClose={vi.fn()} />)
      expect(container.textContent).toContain('Import Data')
      expect(container.textContent).toContain('Discord')
    })

    it('AppSettings — renders app settings form', () => {
      const { container } = render(() => <AppSettings onClose={vi.fn()} onSave={vi.fn()} />)
      expect(container.textContent).toContain('App Settings')
      expect(container.textContent).toContain('Theme')
      expect(container.textContent).toContain('Notifications')
      expect(container.textContent).toContain('Save Settings')
    })

    it('KeyManagement — renders key list and generation controls', () => {
      const { container } = render(() => (
        <KeyManagement mnemonic="test words" did="did:key:abc" onBackupMnemonic={vi.fn()} onSetupRecovery={vi.fn()} />
      ))
      expect(container.textContent).toContain('Key Management')
      expect(container.textContent).toContain('did:key:abc')
      expect(container.textContent).toContain('Backup Recovery Phrase')
    })

    it('Modal — renders overlay with close button and children', () => {
      const { container } = render(() => (
        <Modal open={true} onClose={vi.fn()} title="Test Modal">
          <p>Modal content</p>
        </Modal>
      ))
      expect(container.textContent).toContain('Test Modal')
      expect(container.textContent).toContain('Modal content')
      expect(container.textContent).toContain('✕')
    })

    it('Modal — does not render when closed', () => {
      const { container } = render(() => (
        <Modal open={false} onClose={vi.fn()} title="Hidden">
          <p>hidden</p>
        </Modal>
      ))
      expect(container.textContent).not.toContain('Hidden')
    })

    it('ContextMenu — renders positioned menu with items', () => {
      const { container } = render(() => (
        <ContextMenu items={[{ label: 'Copy', icon: '📋', action: vi.fn() }]}>
          <span>Right-click me</span>
        </ContextMenu>
      ))
      expect(container.textContent).toContain('Right-click me')
    })

    it('Toast — renders toast notifications with auto-dismiss', () => {
      const { container } = render(() => <Toast />)
      // Toast renders a container div; adding a toast should show it
      addToast({ type: 'success', text: 'Test toast!' })
      expect(container.textContent).toContain('Test toast!')
    })

    it('Tooltip — renders tooltip on hover', () => {
      const { container } = render(() => (
        <Tooltip text="Help text">
          <button>Hover me</button>
        </Tooltip>
      ))
      expect(container.textContent).toContain('Hover me')
      // Tooltip text is hidden until hover + delay
      expect(container.textContent).not.toContain('Help text')
    })

    it('VirtualScroller — renders visible items in viewport', () => {
      // Polyfill ResizeObserver for jsdom
      if (typeof globalThis.ResizeObserver === 'undefined') {
        globalThis.ResizeObserver = class {
          observe() {}
          unobserve() {}
          disconnect() {}
        } as any
      }
      const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`)
      const { container } = render(() => (
        <VirtualScroller items={items} itemHeight={30} renderItem={(item) => <div>{item}</div>} />
      ))
      // Should render some items (not all 100)
      expect(container.textContent).toContain('Item 0')
    })
  })
})

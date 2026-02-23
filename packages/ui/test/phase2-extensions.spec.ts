import { describe, it, expect } from 'vitest'
import { createDMStore } from '../src/stores/dm.js'
import { createPresenceStore } from '../src/stores/presence.js'
import type { DMChannelState } from '@harmony/client'

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

  // ── JSX-only Components (require @solidjs/testing-library) ──

  describe('JSX Components (skipped — no @solidjs/testing-library)', () => {
    it.skip('ChannelHeader — renders channel name and member count', () => {
      // Requires @solidjs/testing-library to render SolidJS components
    })

    it.skip('MessageContextMenu — renders menu items for own messages', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('MessageReactions — renders reaction buttons with counts', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('ThreadPanel — renders thread messages and reply composer', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('CommunitySettings — renders settings form with community info', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('CreateCommunityDialog — renders creation form with validation', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('JoinCommunityDialog — renders join form with invite code input', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('LinkDiscordView — renders Discord OAuth link flow', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('MnemonicBackupView — renders mnemonic words grid', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('CredentialBadge — renders badge with credential type icon', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('ProfileView — renders user profile with credentials and presence', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('UserCard — renders compact user card with avatar and status', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('ExportView — renders export options and progress', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('ImportWizard — renders multi-step import wizard', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('AppSettings — renders app settings form', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('KeyManagement — renders key list and generation controls', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('Modal — renders overlay with close button and children', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('ContextMenu — renders positioned menu with items', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('Toast — renders toast notifications with auto-dismiss', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('Tooltip — renders tooltip on hover', () => {
      // Requires @solidjs/testing-library
    })

    it.skip('VirtualScroller — renders visible items in viewport', () => {
      // Requires @solidjs/testing-library
    })
  })
})

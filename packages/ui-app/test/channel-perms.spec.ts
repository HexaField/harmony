// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.tsx'
import { t, en } from '../src/i18n/strings.js'

describe('Channel Permissions', () => {
  it('store has showChannelSettings signal', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.showChannelSettings()).toBe(null)
      store.setShowChannelSettings('ch-1')
      expect(store.showChannelSettings()).toBe('ch-1')
      store.setShowChannelSettings(null)
      expect(store.showChannelSettings()).toBe(null)
      dispose()
    })
  })

  it('store has channelPermissions state', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const perms = store.channelPermissions()
      expect(perms).toBeInstanceOf(Map)
      expect(perms.size).toBe(0)
      dispose()
    })
  })

  it('setChannelPermission sets per-role overrides', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannelPermission('ch-1', 'role-1', { read: true, send: false, manage: false })
      const perms = store.channelPermissions()
      expect(perms.get('ch-1')?.get('role-1')).toEqual({ read: true, send: false, manage: false })
      dispose()
    })
  })

  it('setChannelPermission updates existing overrides', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannelPermission('ch-1', 'role-1', { read: true, send: true, manage: false })
      store.setChannelPermission('ch-1', 'role-1', { read: false, send: true, manage: true })
      expect(store.channelPermissions().get('ch-1')?.get('role-1')).toEqual({ read: false, send: true, manage: true })
      dispose()
    })
  })

  it('supports multiple roles per channel', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannelPermission('ch-1', 'role-1', { read: true, send: true, manage: false })
      store.setChannelPermission('ch-1', 'role-2', { read: true, send: false, manage: true })
      const ch1Perms = store.channelPermissions().get('ch-1')!
      expect(ch1Perms.size).toBe(2)
      expect(ch1Perms.get('role-1')?.send).toBe(true)
      expect(ch1Perms.get('role-2')?.send).toBe(false)
      dispose()
    })
  })

  it('supports multiple channels', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannelPermission('ch-1', 'role-1', { read: true, send: true, manage: false })
      store.setChannelPermission('ch-2', 'role-1', { read: false, send: false, manage: false })
      expect(store.channelPermissions().get('ch-1')?.get('role-1')?.read).toBe(true)
      expect(store.channelPermissions().get('ch-2')?.get('role-1')?.read).toBe(false)
      dispose()
    })
  })
})

describe('Delegations', () => {
  it('store has delegations signal', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.delegations()).toEqual([])
      dispose()
    })
  })

  it('addDelegation adds a delegation', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const d = {
        id: 'del-1',
        fromDID: 'did:key:from',
        toDID: 'did:key:to',
        capabilities: ['send_messages'],
        createdAt: new Date().toISOString(),
        active: true
      }
      store.addDelegation(d)
      expect(store.delegations()).toHaveLength(1)
      expect(store.delegations()[0].id).toBe('del-1')
      dispose()
    })
  })

  it('removeDelegation removes by id', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addDelegation({
        id: 'del-1',
        fromDID: 'did:key:from',
        toDID: 'did:key:to',
        capabilities: ['send_messages'],
        createdAt: new Date().toISOString(),
        active: true
      })
      store.addDelegation({
        id: 'del-2',
        fromDID: 'did:key:from',
        toDID: 'did:key:to2',
        capabilities: ['manage_channels'],
        createdAt: new Date().toISOString(),
        active: true
      })
      store.removeDelegation('del-1')
      expect(store.delegations()).toHaveLength(1)
      expect(store.delegations()[0].id).toBe('del-2')
      dispose()
    })
  })

  it('showDelegationView defaults to false', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.showDelegationView()).toBe(false)
      store.setShowDelegationView(true)
      expect(store.showDelegationView()).toBe(true)
      dispose()
    })
  })
})

describe('Channel Permissions i18n', () => {
  it('has all channel settings strings', () => {
    expect(en.CHANNEL_SETTINGS_TITLE).toBe('Channel Settings')
    expect(en.CHANNEL_SETTINGS_NAME).toBe('Channel name')
    expect(en.CHANNEL_SETTINGS_TOPIC).toBe('Topic')
    expect(en.CHANNEL_SETTINGS_SAVE).toBe('Save Changes')
    expect(en.CHANNEL_SETTINGS_DELETE).toBe('Delete Channel')
    expect(en.CHANNEL_SETTINGS_PERMISSIONS).toBe('Permission Overrides')
    expect(en.CHANNEL_SETTINGS_PERM_READ).toBe('Read')
    expect(en.CHANNEL_SETTINGS_PERM_SEND).toBe('Send')
    expect(en.CHANNEL_SETTINGS_PERM_MANAGE).toBe('Manage')
  })

  it('has all delegation strings', () => {
    expect(en.DELEGATION_TITLE).toBe('Delegations')
    expect(en.DELEGATION_CREATE).toBe('Create Delegation')
    expect(en.DELEGATION_REVOKE).toBe('Revoke')
    expect(en.DELEGATION_EMPTY).toBe('No delegations yet')
    expect(en.DELEGATION_EXPIRY_1H).toBe('1 hour')
    expect(en.DELEGATION_EXPIRY_24H).toBe('24 hours')
    expect(en.DELEGATION_EXPIRY_7D).toBe('7 days')
  })

  it('t() interpolates delete confirm', () => {
    const result = t('CHANNEL_SETTINGS_DELETE_CONFIRM', { name: 'general' })
    expect(result).toContain('general')
  })

  it('t() interpolates delegation expires', () => {
    const result = t('DELEGATION_EXPIRES', { time: '2026-01-01' })
    expect(result).toContain('2026-01-01')
  })
})

describe('Channel Permissions - DOM tests', () => {
  it.skip('renders settings icon for users with manage permission', () => {
    // DOM test - requires jsdom/browser environment
  })

  it.skip('ChannelSettingsModal opens when settings icon clicked', () => {
    // DOM test
  })

  it.skip('DelegationView shows create form', () => {
    // DOM test
  })
})

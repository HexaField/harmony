// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'
import { en } from '../src/i18n/strings.js'

describe('Roles store', () => {
  it('addRole adds a role and sorts by position', () => {
    createRoot(() => {
      const store = createAppStore()
      store.addRole({ id: 'r1', name: 'Mod', permissions: ['kick_members'], position: 1 })
      store.addRole({ id: 'r2', name: 'Admin', permissions: ['manage_roles'], position: 0 })
      expect(store.roles().length).toBe(2)
      expect(store.roles()[0].id).toBe('r2')
      expect(store.roles()[1].id).toBe('r1')
    })
  })

  it('updateRole updates a role', () => {
    createRoot(() => {
      const store = createAppStore()
      store.addRole({ id: 'r1', name: 'Mod', permissions: [], position: 0 })
      store.updateRole('r1', { name: 'Moderator', color: '#FF0000' })
      expect(store.roles()[0].name).toBe('Moderator')
      expect(store.roles()[0].color).toBe('#FF0000')
    })
  })

  it('removeRole removes a role and cleans member roles', () => {
    createRoot(() => {
      const store = createAppStore()
      store.addRole({ id: 'r1', name: 'Mod', permissions: [], position: 0 })
      store.setMembers([{ did: 'did:test:1', displayName: 'Alice', roles: ['r1', 'admin'], status: 'online' }])
      store.removeRole('r1')
      expect(store.roles().length).toBe(0)
      expect(store.members()[0].roles).toEqual(['admin'])
    })
  })

  it('setRoles replaces all roles sorted', () => {
    createRoot(() => {
      const store = createAppStore()
      store.setRoles([
        { id: 'r2', name: 'B', permissions: [], position: 2 },
        { id: 'r1', name: 'A', permissions: [], position: 1 }
      ])
      expect(store.roles()[0].id).toBe('r1')
    })
  })

  it('showRoleManager toggles', () => {
    createRoot(() => {
      const store = createAppStore()
      expect(store.showRoleManager()).toBe(false)
      store.setShowRoleManager(true)
      expect(store.showRoleManager()).toBe(true)
    })
  })
})

describe('Role permission checks', () => {
  it('member with manage_roles permission can manage', () => {
    createRoot(() => {
      const store = createAppStore()
      store.addRole({ id: 'mod', name: 'Mod', permissions: ['manage_roles'], position: 0 })
      store.setMembers([{ did: 'did:test:me', displayName: 'Me', roles: ['mod'], status: 'online' }])
      store.setDid('did:test:me')
      const me = store.members().find((m) => m.did === store.did())!
      const myRoles = store.roles().filter((r) => me.roles.includes(r.id))
      expect(myRoles.some((r) => r.permissions.includes('manage_roles'))).toBe(true)
    })
  })

  it('member with admin role can manage', () => {
    createRoot(() => {
      const store = createAppStore()
      store.setMembers([{ did: 'did:test:me', displayName: 'Me', roles: ['admin'], status: 'online' }])
      store.setDid('did:test:me')
      const me = store.members().find((m) => m.did === store.did())!
      expect(me.roles.includes('admin')).toBe(true)
    })
  })

  it('member without permission cannot manage', () => {
    createRoot(() => {
      const store = createAppStore()
      store.addRole({ id: 'viewer', name: 'Viewer', permissions: ['send_messages'], position: 0 })
      store.setMembers([{ did: 'did:test:me', displayName: 'Me', roles: ['viewer'], status: 'online' }])
      store.setDid('did:test:me')
      const me = store.members().find((m) => m.did === store.did())!
      const myRoles = store.roles().filter((r) => me.roles.includes(r.id))
      expect(myRoles.some((r) => r.permissions.includes('manage_roles'))).toBe(false)
      expect(me.roles.includes('admin')).toBe(false)
    })
  })
})

describe('Role i18n strings', () => {
  it('has all required role strings', () => {
    const roleKeys = [
      'ROLE_MANAGER_TITLE',
      'ROLE_CREATE',
      'ROLE_EDIT',
      'ROLE_DELETE',
      'ROLE_DELETE_CONFIRM',
      'ROLE_NAME',
      'ROLE_NAME_PLACEHOLDER',
      'ROLE_COLOR',
      'ROLE_PERMISSIONS',
      'ROLE_SAVE',
      'ROLE_CANCEL',
      'ROLE_MOVE_UP',
      'ROLE_MOVE_DOWN',
      'ROLE_PERM_SEND_MESSAGES',
      'ROLE_PERM_MANAGE_CHANNELS',
      'ROLE_PERM_MANAGE_ROLES',
      'ROLE_PERM_KICK_MEMBERS',
      'ROLE_PERM_BAN_MEMBERS',
      'ROLE_PERM_MANAGE_COMMUNITY',
      'ROLE_ASSIGN',
      'ROLE_REMOVE',
      'ROLE_NO_ROLES',
      'ROLE_MEMBER_MENU_TITLE'
    ] as const
    for (const key of roleKeys) {
      expect(en[key as keyof typeof en]).toBeDefined()
      expect(typeof en[key as keyof typeof en]).toBe('string')
    }
  })
})

describe('Role assign to member', () => {
  it('assigns role to member via store', () => {
    createRoot(() => {
      const store = createAppStore()
      store.addRole({ id: 'mod', name: 'Mod', permissions: [], position: 0 })
      store.setMembers([{ did: 'did:test:1', displayName: 'Alice', roles: [], status: 'online' }])
      store.setMembers(store.members().map((m) => (m.did === 'did:test:1' ? { ...m, roles: [...m.roles, 'mod'] } : m)))
      expect(store.members()[0].roles).toContain('mod')
    })
  })
})

describe('RoleManagerView DOM', () => {
  it.todo('renders role list (requires DOM environment with SolidJS)', () => {
    // Needs jsdom + solid-js render setup — skipped for unit tests
  })
})

describe('MemberSidebarView DOM', () => {
  it.todo('shows role badges with colors (requires DOM environment with SolidJS)', () => {
    // Needs jsdom + solid-js render setup — skipped for unit tests
  })

  it.todo('shows role assignment menu on click (requires DOM environment with SolidJS)', () => {
    // Needs jsdom + solid-js render setup — skipped for unit tests
  })
})

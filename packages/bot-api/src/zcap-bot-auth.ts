import type { BotPermission } from './bot-host.js'

/**
 * ZCAP-based authorization for bot actions.
 * In production, verifies ZCAP chains. For testing, uses a simple permission map.
 */
export class ZCAPBotAuth {
  private adminCapabilities = new Map<string, Set<string>>() // installerDID -> Set<communityId>
  private botPermissions = new Map<string, Map<string, Set<BotPermission>>>() // botDID -> communityId -> perms
  private channelScopes = new Map<string, Set<string>>() // botDID -> Set<channelId>

  grantAdmin(did: string, communityId: string): void {
    if (!this.adminCapabilities.has(did)) {
      this.adminCapabilities.set(did, new Set())
    }
    this.adminCapabilities.get(did)!.add(communityId)
  }

  hasAdminCapability(did: string, communityId: string): boolean {
    return this.adminCapabilities.get(did)?.has(communityId) ?? false
  }

  hasPermission(did: string, communityId: string, permission: BotPermission): boolean {
    // Admins have all permissions
    if (this.hasAdminCapability(did, communityId)) return true
    return this.hasBotPermission(did, communityId, permission)
  }

  grantBotPermission(botDID: string, communityId: string, permission: BotPermission): void {
    if (!this.botPermissions.has(botDID)) {
      this.botPermissions.set(botDID, new Map())
    }
    if (!this.botPermissions.get(botDID)!.has(communityId)) {
      this.botPermissions.get(botDID)!.set(communityId, new Set())
    }
    this.botPermissions.get(botDID)!.get(communityId)!.add(permission)
  }

  hasBotPermission(botDID: string, communityId: string, permission: BotPermission): boolean {
    return this.botPermissions.get(botDID)?.get(communityId)?.has(permission) ?? false
  }

  revokeBotPermissions(botDID: string, communityId: string): void {
    this.botPermissions.get(botDID)?.delete(communityId)
  }

  scopeToChannels(botDID: string, channelIds: string[]): void {
    this.channelScopes.set(botDID, new Set(channelIds))
  }

  canAccessChannel(botDID: string, channelId: string): boolean {
    const scope = this.channelScopes.get(botDID)
    if (!scope) return true // No scope restriction = all channels
    return scope.has(channelId)
  }
}

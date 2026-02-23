// OAuth handler
import type { KVNamespace } from './types.js'

export interface OAuthHandler {
  storeState(state: string, data: Record<string, string>): Promise<void>
  validateState(state: string): Promise<Record<string, string> | null>
  getDiscordAuthUrl(clientId: string, redirectUri: string, state: string): string
}

export function createOAuthHandler(kv: KVNamespace): OAuthHandler {
  return {
    async storeState(state: string, data: Record<string, string>): Promise<void> {
      await kv.put(`oauth_state:${state}`, JSON.stringify(data), { expirationTtl: 600 }) // 10 min TTL
    },

    async validateState(state: string): Promise<Record<string, string> | null> {
      const data = await kv.get(`oauth_state:${state}`)
      if (!data) return null
      // Consume the state (one-time use)
      await kv.delete(`oauth_state:${state}`)
      return JSON.parse(data)
    },

    getDiscordAuthUrl(clientId: string, redirectUri: string, state: string): string {
      return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify&state=${state}`
    }
  }
}

// Server provisioning abstraction
// The UI doesn't care HOW a server is created — it asks for one and gets a WebSocket URL back.

export type HostingMode = 'local' | 'cloud' | 'remote'

export interface ServerProvisionResult {
  serverUrl: string // ws:// or wss:// URL ready to connect
  mode: HostingMode
  instanceId?: string // cloud instance ID (for management)
  name: string
}

export interface ServerProvider {
  /** What hosting modes are available in this environment? */
  availableModes(): HostingMode[]

  /** Provision a new server. Returns a connectable WebSocket URL. */
  provision(params: { mode: HostingMode; name: string; ownerDID: string }): Promise<ServerProvisionResult>

  /** Check if a remote server URL is reachable */
  checkHealth(serverUrl: string): Promise<boolean>
}

/**
 * Detect what hosting modes are available.
 * - 'local': only in desktop app (Electron/Tauri with Node.js)
 * - 'cloud': when VITE_CLOUD_API_URL is configured
 * - 'remote': always available (user provides URL)
 */
function detectAvailableModes(): HostingMode[] {
  const modes: HostingMode[] = ['remote'] // always available

  // Cloud is available when the cloud API is configured
  const cloudUrl = import.meta.env.VITE_CLOUD_API_URL
  if (cloudUrl) {
    modes.unshift('cloud')
  }

  // Local is available in desktop app context (exposed via window.__HARMONY_DESKTOP__)
  if (typeof window !== 'undefined' && (window as any).__HARMONY_DESKTOP__) {
    modes.unshift('local')
  }

  return modes
}

export function createServerProvider(): ServerProvider {
  return {
    availableModes: detectAvailableModes,

    async provision({ mode, name, ownerDID }) {
      switch (mode) {
        case 'local': {
          // Ask the desktop app bridge to start a local server
          const desktop = (window as any).__HARMONY_DESKTOP__
          if (!desktop?.startServer) {
            throw new Error('Local server hosting is not available in this environment')
          }
          const result = await desktop.startServer({ name })
          return {
            serverUrl: result.serverUrl || 'ws://localhost:4000',
            mode: 'local',
            name
          }
        }

        case 'cloud': {
          const cloudUrl = import.meta.env.VITE_CLOUD_API_URL
          if (!cloudUrl) {
            throw new Error('Cloud hosting is not configured')
          }
          const res = await fetch(`${cloudUrl}/api/hosting/instances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, ownerDID })
          })
          if (!res.ok) {
            const body = await res.text()
            throw new Error(`Cloud provisioning failed: ${body}`)
          }
          const data = await res.json()
          return {
            serverUrl: data.serverUrl,
            mode: 'cloud',
            instanceId: data.id,
            name
          }
        }

        case 'remote': {
          // Remote mode doesn't provision — the user provides the URL
          // This is a no-op; the URL is passed directly
          throw new Error('Remote mode does not provision — provide a server URL directly')
        }
      }
    },

    async checkHealth(serverUrl: string) {
      try {
        // Convert ws URL to health HTTP URL (port + 1)
        const url = new URL(serverUrl.replace('ws://', 'http://').replace('wss://', 'https://'))
        const port = parseInt(url.port || '4000', 10)
        const healthUrl = `${url.protocol}//${url.hostname}:${port + 1}/health`
        const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) })
        if (!res.ok) return false
        const data = await res.json()
        return data.status === 'healthy'
      } catch {
        return false
      }
    }
  }
}

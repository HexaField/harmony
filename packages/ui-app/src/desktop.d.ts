interface HarmonyDesktopConfig {
  version: number
  identity?: {
    did: string
    mnemonic: string
    displayName?: string
    createdAt: string
  }
  servers?: Array<{ url: string; label?: string }>
}

interface HarmonyDesktopBridge {
  startServer(): Promise<{ serverUrl: string }>
  stopServer(): Promise<{ stopped: boolean }>
  getServerUrl(): Promise<string | null>
  isServerRunning(): Promise<boolean>
  getStatus(): Promise<any>
  createIdentity(): Promise<{ did: string; mnemonic: string }>
  recoverIdentity(mnemonic: string): Promise<{ did: string }>
  onDeepLink(callback: (data: { action: string; params: Record<string, string> }) => void): void
  onServerStarted?(callback: (data: { serverUrl: string }) => void): void
  waitForServer?(): Promise<string>
  getConfig?(): Promise<HarmonyDesktopConfig>
  updateConfig?(patch: Partial<HarmonyDesktopConfig>): Promise<HarmonyDesktopConfig>
}

declare global {
  interface Window {
    __HARMONY_DESKTOP__?: HarmonyDesktopBridge
    harmony?: HarmonyDesktopBridge
  }
}

export {}

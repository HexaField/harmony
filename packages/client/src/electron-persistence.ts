// Electron filesystem persistence via IPC bridge
// This adapter works when running inside the Electron app

export interface ElectronBridge {
  persistData(key: string, value: string): Promise<void>
  loadData(key: string): Promise<string | null>
  removeData(key: string): Promise<void>
  listDataKeys(): Promise<string[]>
}

/** KVPersistenceAdapter backed by Electron's filesystem via IPC */
export class ElectronPersistence {
  private bridge: ElectronBridge

  constructor(bridge?: ElectronBridge) {
    this.bridge = bridge ?? (globalThis as any).__HARMONY_DESKTOP__
    if (!this.bridge) throw new Error('ElectronPersistence requires __HARMONY_DESKTOP__ bridge')
  }

  async get(key: string): Promise<string | null> {
    return this.bridge.loadData(key)
  }

  async set(key: string, value: string): Promise<void> {
    await this.bridge.persistData(key, value)
  }

  async remove(key: string): Promise<void> {
    await this.bridge.removeData(key)
  }

  async keys(): Promise<string[]> {
    return this.bridge.listDataKeys()
  }
}

export interface BackgroundSyncService {
  registerSync(tag: string): Promise<void>
  onSync(tag: string, cb: () => Promise<void>): void
  getLastSyncTime(): Promise<string | null>
  setMinSyncInterval(seconds: number): void
}

export class InMemoryBackgroundSync implements BackgroundSyncService {
  private registeredTags = new Set<string>()
  private syncHandlers = new Map<string, (() => Promise<void>)[]>()
  private lastSyncTime: string | null = null
  private minInterval = 300 // 5 minutes default

  async registerSync(tag: string): Promise<void> {
    this.registeredTags.add(tag)
  }

  onSync(tag: string, cb: () => Promise<void>): void {
    if (!this.syncHandlers.has(tag)) {
      this.syncHandlers.set(tag, [])
    }
    this.syncHandlers.get(tag)!.push(cb)
  }

  async getLastSyncTime(): Promise<string | null> {
    return this.lastSyncTime
  }

  setMinSyncInterval(seconds: number): void {
    this.minInterval = seconds
  }

  getMinInterval(): number {
    return this.minInterval
  }

  isRegistered(tag: string): boolean {
    return this.registeredTags.has(tag)
  }

  // Test helper: trigger sync
  async triggerSync(tag: string): Promise<void> {
    const handlers = this.syncHandlers.get(tag) ?? []
    for (const h of handlers) {
      await h()
    }
    this.lastSyncTime = new Date().toISOString()
  }
}

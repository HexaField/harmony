import type { BackgroundSyncService } from './background-sync.js'
import { InMemoryBackgroundSync } from './background-sync.js'

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export class CapacitorBackgroundSync implements BackgroundSyncService {
  private fallback = new InMemoryBackgroundSync()
  private native: boolean | null = null
  private syncHandlers = new Map<string, (() => Promise<void>)[]>()
  private lastSyncTime: string | null = null
  // @ts-ignore minInterval is set but read only by native bridge
  private minInterval = 300

  private async useNative(): Promise<boolean> {
    if (this.native === null) this.native = await isNative()
    return this.native
  }

  async registerSync(tag: string): Promise<void> {
    if (!(await this.useNative())) return this.fallback.registerSync(tag)
    try {
      const { BackgroundTask } = await import('@capawesome-team/capacitor-background-task')
      BackgroundTask.beforeExit(async () => {
        const handlers = this.syncHandlers.get(tag) ?? []
        for (const h of handlers) await h()
        this.lastSyncTime = new Date().toISOString()
        BackgroundTask.finish()
      })
    } catch {
      return this.fallback.registerSync(tag)
    }
  }

  onSync(tag: string, cb: () => Promise<void>): void {
    if (!this.syncHandlers.has(tag)) this.syncHandlers.set(tag, [])
    this.syncHandlers.get(tag)!.push(cb)
    this.fallback.onSync(tag, cb)
  }

  async getLastSyncTime(): Promise<string | null> {
    return this.lastSyncTime ?? this.fallback.getLastSyncTime()
  }

  setMinSyncInterval(seconds: number): void {
    this.minInterval = seconds
    this.fallback.setMinSyncInterval(seconds)
  }
}

export function createBackgroundSync(): BackgroundSyncService {
  return new CapacitorBackgroundSync()
}
